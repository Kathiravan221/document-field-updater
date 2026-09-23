package com.example.backend.service;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class DocumentAnalysisService {

    // ============================================================
    // MAIN METHOD
    // ============================================================

    public Map<String, String> extractFields(MultipartFile file)
            throws IOException {

        String fileName = file.getOriginalFilename();

        if (fileName == null || fileName.isBlank()) {
            throw new IOException("File name is missing");
        }

        // ========================================================
        // DOCX
        // ========================================================

        if (fileName.toLowerCase().endsWith(".docx")) {

            return extractFieldsFromDocx(file);
        }

        // ========================================================
        // XLSX
        // ========================================================

        else if (fileName.toLowerCase().endsWith(".xlsx")) {

            return extractFieldsFromExcel(file);
        }

        // ========================================================
        // UNSUPPORTED FILE
        // ========================================================

        else {

            throw new IOException(
                    "Unsupported file type: " + fileName
            );
        }
    }

    // ============================================================
    // READ DOCX
    // ============================================================

    private Map<String, String> extractFieldsFromDocx(
            MultipartFile file) throws IOException {

        Map<String, String> fields =
                new LinkedHashMap<>();

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
                            row.getTableCells().get(0);

                    XWPFTableCell valueCell =
                            row.getTableCells().get(1);

                    String fieldName =
                            fieldCell
                                    .getText()
                                    .trim();

                    String fieldValue =
                            valueCell
                                    .getText()
                                    .trim();

                    // ------------------------------------------------
                    // Ignore empty field names
                    // Ignore header row
                    // ------------------------------------------------

                    if (!fieldName.isEmpty()
                            && !fieldName.equalsIgnoreCase(
                                    "Field Name")) {

                        fields.put(
                                fieldName,
                                fieldValue
                        );
                    }
                }
            }
        }

        document.close();

        return fields;
    }

    // ============================================================
    // READ XLSX
    // ============================================================

    private Map<String, String> extractFieldsFromExcel(
            MultipartFile file) throws IOException {

        Map<String, String> fields =
                new LinkedHashMap<>();

        Workbook workbook =
                WorkbookFactory.create(
                        file.getInputStream()
                );

        // --------------------------------------------------------
        // Read every Excel sheet
        // --------------------------------------------------------

        for (Sheet sheet :
                workbook) {

            // ----------------------------------------------------
            // Read every row
            // ----------------------------------------------------

            for (Row row :
                    sheet) {

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

                // Get Column B
                Cell valueCell =
                        row.getCell(1);

                String fieldValue = "";

                if (valueCell != null) {

                    fieldValue =
                            getCellValue(valueCell)
                                    .trim();
                }

                // ------------------------------------------------
                // Ignore empty field names
                // Ignore header row
                // ------------------------------------------------

                if (!fieldName.isEmpty()
                        && !fieldName.equalsIgnoreCase(
                                "Field Name")) {

                    fields.put(
                            fieldName,
                            fieldValue
                    );
                }
            }
        }

        workbook.close();

        return fields;
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