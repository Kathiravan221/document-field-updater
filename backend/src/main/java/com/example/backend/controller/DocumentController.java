package com.example.backend.controller;

import com.example.backend.service.DocumentAnalysisService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@RestController
@RequestMapping("/api/documents")
@CrossOrigin(origins = "https://document-field-updater-ibp9.vercel.app")
public class DocumentController {

    private final DocumentAnalysisService analysisService;

    public DocumentController(DocumentAnalysisService analysisService) {
        this.analysisService = analysisService;
    }

    // ============================================================
    // TEST API
    // ============================================================

    @GetMapping("/test")
    public String test() {
        return "Document Updater Backend is Working!";
    }

    // ============================================================
    // UPLOAD API
    // ============================================================

    @PostMapping("/upload")
    public ResponseEntity<String> uploadDocuments(
            @RequestParam("files") MultipartFile[] files) {

        if (files == null || files.length == 0) {
            return ResponseEntity.badRequest()
                    .body("No files uploaded");
        }

        StringBuilder result = new StringBuilder();

        result.append("Files uploaded successfully:\n");

        for (MultipartFile file : files) {

            result.append(file.getOriginalFilename())
                    .append("\n");
        }

        return ResponseEntity.ok(result.toString());
    }

    // ============================================================
    // ANALYZE API
    // ============================================================

    @PostMapping("/analyze")
    public ResponseEntity<?> analyzeDocuments(
            @RequestParam("files") MultipartFile[] files) {

        if (files == null || files.length == 0) {
            return ResponseEntity.badRequest()
                    .body("No files uploaded");
        }

        try {

            // Store fields and values from every document
            List<Map<String, String>> allDocumentFields =
                    new ArrayList<>();

            for (MultipartFile file : files) {

                Map<String, String> fields =
                        analysisService.extractFields(file);

                allDocumentFields.add(fields);
            }

            // Get fields from the first document
            Set<String> commonFields =
                    new LinkedHashSet<>(
                            allDocumentFields
                                    .get(0)
                                    .keySet()
                    );

            // Keep only fields available in every document
            for (int i = 1;
                 i < allDocumentFields.size();
                 i++) {

                commonFields.retainAll(
                        allDocumentFields
                                .get(i)
                                .keySet()
                );
            }

            // Create final field list
            List<Map<String, String>> result =
                    new ArrayList<>();

            for (String fieldName : commonFields) {

                Map<String, String> field =
                        new LinkedHashMap<>();

                field.put(
                        "name",
                        fieldName
                );

                // Value from first document
                field.put(
                        "value",
                        allDocumentFields
                                .get(0)
                                .get(fieldName)
                );

                result.add(field);
            }

            // Create response
            Map<String, Object> response =
                    new LinkedHashMap<>();

            response.put(
                    "numberOfFiles",
                    files.length
            );

            response.put(
                    "commonFields",
                    result
            );

            return ResponseEntity.ok(response);

        } catch (IOException e) {

            return ResponseEntity
                    .internalServerError()
                    .body(
                            "Error reading documents: "
                                    + e.getMessage()
                    );
        }
    }

    // ============================================================
    // UPDATE API
    // ============================================================

    @PostMapping("/update")
    public ResponseEntity<?> updateDocuments(
            @RequestParam("files") MultipartFile[] files,
            @RequestParam("fields") String fieldsJson) {

        if (files == null || files.length == 0) {

            return ResponseEntity.badRequest()
                    .body("No files uploaded");
        }

        try {

            // ----------------------------------------------------
            // Convert JSON into Map
            // ----------------------------------------------------

            ObjectMapper objectMapper =
                    new ObjectMapper();

            Map<String, String> fields =
                    objectMapper.readValue(
                            fieldsJson,
                            new TypeReference<Map<String, String>>() {
                            }
                    );

            // ----------------------------------------------------
            // Create ZIP file
            // ----------------------------------------------------

            ByteArrayOutputStream zipOutput =
                    new ByteArrayOutputStream();

            ZipOutputStream zip =
                    new ZipOutputStream(zipOutput);

            // ----------------------------------------------------
            // Process every uploaded document
            // ----------------------------------------------------

            for (MultipartFile file : files) {

                String fileName =
                        file.getOriginalFilename();

                if (fileName == null ||
                        fileName.isBlank()) {

                    fileName = "updated_document";
                }

                byte[] updatedFile;

                // =================================================
                // DOCX FILE
                // =================================================

                if (fileName
                        .toLowerCase()
                        .endsWith(".docx")) {

                    updatedFile =
                            updateDocxFile(
                                    file,
                                    fields
                            );
                }

                // =================================================
                // XLSX FILE
                // =================================================

                else if (fileName
                        .toLowerCase()
                        .endsWith(".xlsx")) {

                    updatedFile =
                            updateExcelFile(
                                    file,
                                    fields
                            );
                }

                // =================================================
                // UNSUPPORTED FILE
                // =================================================

                else {

                    throw new IOException(
                            "Unsupported file type: "
                                    + fileName
                    );
                }

                // ------------------------------------------------
                // Add updated file to ZIP
                // ------------------------------------------------

                ZipEntry entry =
                        new ZipEntry(fileName);

                zip.putNextEntry(entry);

                zip.write(updatedFile);

                zip.closeEntry();
            }

            // ----------------------------------------------------
            // Finish ZIP
            // ----------------------------------------------------

            zip.close();

            // ----------------------------------------------------
            // Return ZIP to React/Postman
            // ----------------------------------------------------

            return ResponseEntity.ok()
                    .header(
                            "Content-Disposition",
                            "attachment; filename=updated_documents.zip"
                    )
                    .header(
                            "Content-Type",
                            "application/zip"
                    )
                    .body(
                            zipOutput.toByteArray()
                    );

        } catch (Exception e) {

            return ResponseEntity
                    .internalServerError()
                    .body(
                            "Error updating documents: "
                                    + e.getMessage()
                    );
        }
    }

    // ============================================================
    // UPDATE DOCX
    // ============================================================

    private byte[] updateDocxFile(
            MultipartFile file,
            Map<String, String> fields)
            throws IOException {

        XWPFDocument document =
                new XWPFDocument(
                        file.getInputStream()
                );

        // --------------------------------------------------------
        // Read all tables
        // --------------------------------------------------------

        for (XWPFTable table :
                document.getTables()) {

            // ----------------------------------------------------
            // Read every row
            // ----------------------------------------------------

            for (XWPFTableRow row :
                    table.getRows()) {

                // Need at least 2 cells
                //
                // Cell 1 = Field Name
                // Cell 2 = Value

                if (row.getTableCells().size() >= 2) {

                    XWPFTableCell fieldCell =
                            row.getTableCells()
                                    .get(0);

                    XWPFTableCell valueCell =
                            row.getTableCells()
                                    .get(1);

                    String fieldName =
                            fieldCell
                                    .getText()
                                    .trim();

                    // ------------------------------------------------
                    // Check whether field needs update
                    // ------------------------------------------------

                    if (fields.containsKey(fieldName)) {

                        String newValue =
                                fields.get(fieldName);

                        // Remove old paragraph
                        if (!valueCell
                                .getParagraphs()
                                .isEmpty()) {

                            valueCell.removeParagraph(0);
                        }

                        // Add new value
                        valueCell
                                .addParagraph()
                                .createRun()
                                .setText(newValue);
                    }
                }
            }
        }

        // --------------------------------------------------------
        // Convert updated DOCX into bytes
        // --------------------------------------------------------

        ByteArrayOutputStream output =
                new ByteArrayOutputStream();

        document.write(output);

        document.close();

        return output.toByteArray();
    }

    // ============================================================
    // UPDATE EXCEL
    // ============================================================

    private byte[] updateExcelFile(
            MultipartFile file,
            Map<String, String> fields)
            throws IOException {

        Workbook workbook =
                WorkbookFactory.create(
                        file.getInputStream()
                );

        // --------------------------------------------------------
        // Read every sheet
        // --------------------------------------------------------

        for (Sheet sheet :
                workbook) {

            // ----------------------------------------------------
            // Read every row
            // ----------------------------------------------------

            for (Row row :
                    sheet) {

                // Need at least 2 columns
                //
                // Column A = Field Name
                // Column B = Value

                Cell fieldCell =
                        row.getCell(0);

                if (fieldCell == null) {
                    continue;
                }

                String fieldName =
                        getCellValue(fieldCell)
                                .trim();

                // ------------------------------------------------
                // Check whether field needs update
                // ------------------------------------------------

                if (fields.containsKey(fieldName)) {

                    String newValue =
                            fields.get(fieldName);

                    Cell valueCell =
                            row.getCell(1);

                    // If column B does not exist,
                    // create it
                    if (valueCell == null) {

                        valueCell =
                                row.createCell(1);
                    }

                    // Set new value
                    valueCell.setCellValue(
                            newValue
                    );
                }
            }
        }

        // --------------------------------------------------------
        // Convert updated Excel into bytes
        // --------------------------------------------------------

        ByteArrayOutputStream output =
                new ByteArrayOutputStream();

        workbook.write(output);

        workbook.close();

        return output.toByteArray();
    }

    // ============================================================
    // READ EXCEL CELL VALUE
    // ============================================================

    private String getCellValue(Cell cell) {

        DataFormatter formatter =
                new DataFormatter();

        return formatter.formatCellValue(cell);
    }
}