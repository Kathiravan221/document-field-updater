import React, { useState } from "react";
import JSZip from "jszip";
import "./Home.css";

function Home() {
  // ================= STATE =================

  const [files, setFiles] = useState([]);
  const [fields, setFields] = useState([]);

  const [progress, setProgress] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);

  // Analyze state
  const [analyzing, setAnalyzing] = useState(false);

  // Updated ZIP received from backend
  const [updatedZipBlob, setUpdatedZipBlob] = useState(null);

  // View Changes modal
  const [viewingFile, setViewingFile] = useState(null);

  // ================= UPLOAD FILES =================

  const handleFileUpload = (event) => {
    const selectedFiles = Array.from(event.target.files);

    if (selectedFiles.length === 0) {
      return;
    }

    const newFiles = selectedFiles.map((file) => ({
      file: file,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      type: getFileType(file),
      status: "Ready",
      changes: [],
    }));

    setFiles((previousFiles) => {
      const isFirstUpload = previousFiles.length === 0;

      if (isFirstUpload) {
        setFields([]);
      }

      return [...previousFiles, ...newFiles];
    });

    setUpdated(false);
    setProgress(0);
    setUpdatedZipBlob(null);

    // Allows the same file to be selected again
    event.target.value = "";
  };

  // ================= ANALYZE DOCUMENTS =================

  const analyzeDocuments = async () => {
    if (files.length === 0) {
      alert("Please upload documents first.");
      return;
    }

    setAnalyzing(true);
    setFields([]);
    setUpdated(false);
    setProgress(0);
    setUpdatedZipBlob(null);

    try {
      const formData = new FormData();

      files.forEach((item) => {
        formData.append("files", item.file);
      });

      const response = await fetch(
        "http://localhost:8080/api/documents/analyze",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();

      const detectedFields = data.commonFields.map((field) => ({
        name: field.name,
        value: field.value || "",
      }));

      setFields(detectedFields);

      if (detectedFields.length === 0) {
        alert("No common fields were found in all documents.");
      }
    } catch (error) {
      console.error("Analyze error:", error);

      alert(
        "Unable to analyze documents. Please make sure the Spring Boot backend is running."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // ================= GET FILE TYPE =================

  const getFileType = (file) => {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".pdf")) {
      return "PDF Document";
    }

    if (
      fileName.endsWith(".doc") ||
      fileName.endsWith(".docx")
    ) {
      return "Word Document";
    }

    if (
      fileName.endsWith(".xls") ||
      fileName.endsWith(".xlsx")
    ) {
      return "Excel Document";
    }

    return "Document";
  };

  // ================= REMOVE FILE =================

  const removeFile = (index) => {
    setFiles((previousFiles) =>
      previousFiles.filter(
        (_, fileIndex) => fileIndex !== index
      )
    );

    if (files.length === 1) {
      setFields([]);
      setProgress(0);
      setUpdated(false);
      setUpdatedZipBlob(null);
    } else {
      setUpdated(false);
      setProgress(0);
      setUpdatedZipBlob(null);
    }
  };

  // ================= CHANGE FIELD VALUE =================

  const handleFieldChange = (index, value) => {
    setFields((previousFields) =>
      previousFields.map((field, fieldIndex) =>
        fieldIndex === index
          ? {
              ...field,
              value: value,
            }
          : field
      )
    );

    // Documents need to be updated again
    setUpdated(false);
    setProgress(0);
    setUpdatedZipBlob(null);

    // Clear previous changes
    setFiles((previousFiles) =>
      previousFiles.map((file) => ({
        ...file,
        changes: [],
        status: "Ready",
      }))
    );
  };

  // ================= REMOVE COMMON FIELD =================

  const removeField = (index) => {
    setFields((previousFields) =>
      previousFields.filter(
        (_, fieldIndex) => fieldIndex !== index
      )
    );

    setUpdated(false);
    setProgress(0);
    setUpdatedZipBlob(null);

    setFiles((previousFiles) =>
      previousFiles.map((file) => ({
        ...file,
        changes: [],
        status: "Ready",
      }))
    );
  };

  // ================= ADD NEW FIELD =================

  const addField = () => {
    setFields((previousFields) => [
      ...previousFields,
      {
        name: "New Field",
        value: "",
      },
    ]);

    setUpdated(false);
    setProgress(0);
    setUpdatedZipBlob(null);
  };

  // ================= UPDATE DOCUMENTS =================
  // Connects to Spring Boot /api/documents/update
  //
  // IMPORTANT:
  // This function DOES NOT download the ZIP.
  // It only sends the documents to Spring Boot,
  // receives the updated ZIP and stores it in memory.

  const updateDocuments = async () => {
    if (files.length === 0) {
      alert("Please upload documents first.");
      return;
    }

    if (fields.length === 0) {
      alert("Please analyze the documents first.");
      return;
    }

    // Check that field names are not empty
    const invalidField = fields.find(
      (field) =>
        !field.name ||
        field.name.trim() === ""
    );

    if (invalidField) {
      alert("Please enter a field name.");
      return;
    }

    try {
      setUpdating(true);
      setUpdated(false);
      setProgress(10);
      setUpdatedZipBlob(null);

      // ==========================================
      // CREATE FORM DATA
      // ==========================================

      const formData = new FormData();

      // Add all uploaded documents
      files.forEach((item) => {
        formData.append("files", item.file);
      });

      // ==========================================
      // CREATE FIELD OBJECT
      // ==========================================

      const fieldsObject = {};

      fields.forEach((field) => {
        fieldsObject[field.name] =
          field.value || "";
      });

      // Convert object to JSON
      const fieldsJson =
        JSON.stringify(fieldsObject);

      // Add fields JSON to request
      formData.append("fields", fieldsJson);

      setProgress(30);

      // ==========================================
      // CALL SPRING BOOT API
      // ==========================================

      const response = await fetch(
        "http://localhost:8080/api/documents/update",
        {
          method: "POST",
          body: formData,
        }
      );

      setProgress(70);

      // ==========================================
      // CHECK RESPONSE
      // ==========================================

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(errorText);
      }

      // ==========================================
      // RECEIVE ZIP FROM BACKEND
      // ==========================================

      const blob =
        await response.blob();

      setProgress(90);

      // ==========================================
      // STORE UPDATED ZIP
      // ==========================================

      // IMPORTANT:
      // We store the ZIP but DO NOT download it.
      setUpdatedZipBlob(blob);

      // ==========================================
      // CREATE CHANGE INFORMATION
      // ==========================================

      setFiles((previousFiles) =>
        previousFiles.map((file) => ({
          ...file,

          status: "Updated",

          changes: fields
            .filter(
              (field) =>
                field.value &&
                field.value.trim() !== ""
            )
            .map((field) => ({
              field: field.name,

              // Value detected during analysis
              before: getOriginalValue(
                field.name
              ),

              // New value entered by user
              after: field.value,
            })),
        }))
      );

      // ==========================================
      // UPDATE COMPLETED
      // ==========================================

      setProgress(100);
      setUpdating(false);
      setUpdated(true);

      // ==========================================
      // NO AUTOMATIC DOWNLOAD HERE
      // ==========================================

      alert(
        "Documents updated successfully!\n\nClick 'Download All Documents' to download the updated files."
      );
    } catch (error) {
      console.error(
        "Update error:",
        error
      );

      setProgress(0);
      setUpdating(false);
      setUpdated(false);
      setUpdatedZipBlob(null);

      alert(
        "Unable to update documents.\n\nPlease make sure the Spring Boot backend is running."
      );
    }
  };

  // ================= GET ORIGINAL VALUE =================

  const getOriginalValue = (fieldName) => {
    const field = fields.find(
      (item) => item.name === fieldName
    );

    if (field) {
      return field.value || "Existing Value";
    }

    return "Existing Value";
  };

  // ================= DOWNLOAD ZIP =================

  const downloadZip = (blob) => {
    if (!blob) {
      return;
    }

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      "updated_documents.zip";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  };

  // ================= DOWNLOAD ONE UPDATED FILE =================

  const downloadUpdatedFile = async (
    fileObject
  ) => {
    if (!fileObject) {
      return;
    }

    // If update has not happened,
    // download original file.
    if (!updatedZipBlob) {
      downloadOriginalFile(fileObject.file);
      return;
    }

    try {
      const zip =
        await JSZip.loadAsync(
          updatedZipBlob
        );

      const zipFile =
        zip.file(fileObject.name);

      if (!zipFile) {
        alert(
          `Updated file "${fileObject.name}" was not found in the ZIP.`
        );
        return;
      }

      const fileBlob =
        await zipFile.async("blob");

      const url =
        window.URL.createObjectURL(
          fileBlob
        );

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        fileObject.name;

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(
        "Individual download error:",
        error
      );

      alert(
        "Unable to download the updated document."
      );
    }
  };

  // ================= DOWNLOAD ORIGINAL FILE =================

  const downloadOriginalFile = (
    fileObject
  ) => {
    if (!fileObject) {
      return;
    }

    const url =
      URL.createObjectURL(fileObject);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      fileObject.name;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // ================= DOWNLOAD ONE FILE =================

  const downloadFile = (fileObject) => {
    if (!fileObject) {
      return;
    }

    // If updated documents are available,
    // download updated version.
    if (updatedZipBlob) {
      const matchingFile =
        files.find(
          (item) =>
            item.file === fileObject
        );

      if (matchingFile) {
        downloadUpdatedFile(
          matchingFile
        );

        return;
      }
    }

    // Otherwise download original
    downloadOriginalFile(fileObject);
  };

  // ================= DOWNLOAD ALL FILES =================

  const downloadAllDocuments = () => {
    if (files.length === 0) {
      return;
    }

    // If updated ZIP is available,
    // download updated ZIP.
    if (updatedZipBlob) {
      downloadZip(updatedZipBlob);
      return;
    }

    // Otherwise download original files.
    files.forEach((item, index) => {
      setTimeout(() => {
        downloadOriginalFile(item.file);
      }, index * 300);
    });
  };

  // ================= VIEW CHANGES =================

  const viewChanges = (file) => {
    setViewingFile(file);
  };

  // ================= CLOSE CHANGES =================

  const closeChanges = () => {
    setViewingFile(null);
  };

  // ================= JSX =================

  return (
    <div className="app-container">

      {/* ================= NAVBAR ================= */}

      <header className="navbar">

        <div className="brand-section">

          <div className="brand-icon">
            ▣
          </div>

          <div>
            <h1>
              Document Field Updater
            </h1>

            <span>
              UPDATE DOCUMENTS
            </span>
          </div>

        </div>

        <div className="nav-actions">

          <button className="nav-icon">
            ◔
          </button>

          <button className="profile-icon">
            ●
          </button>

        </div>

      </header>


      {/* ================= STEP INDICATOR ================= */}

      <div className="step-container">

        <div className="step active">

          <div className="step-number">
            ✓
          </div>

          <div>
            <strong>
              1. Upload
            </strong>

            <span>
              Documents
            </span>
          </div>

        </div>


        <div className="step-line"></div>


        <div
          className={`step ${
            fields.length > 0
              ? "active"
              : ""
          }`}
        >

          <div className="step-number">
            2
          </div>

          <div>
            <strong>
              2. Common
            </strong>

            <span>
              Fields
            </span>
          </div>

        </div>


        <div className="step-line"></div>


        <div
          className={`step ${
            updated || updating
              ? "active"
              : ""
          }`}
        >

          <div className="step-number">
            3
          </div>

          <div>
            <strong>
              3. Export
            </strong>

            <span>
              Documents
            </span>
          </div>

        </div>

      </div>


      {/* ================= MAIN CONTENT ================= */}

      <main className="main-content">

        <div className="version-label">
          DOCUMENT FIELD UPDATER V2.4
        </div>

        <h2>
          Update Multiple Documents Easily
        </h2>

        <p className="intro-text">
          Upload your documents, identify common fields,
          update them once, and apply the changes across
          all your documents.
        </p>


        {/* ================= UPLOAD SECTION ================= */}

        <section className="card">

          <div className="section-header">

            <div className="section-title">

              <div className="section-icon">
                ▣
              </div>

              <div>

                <h3>
                  1. Upload Documents
                </h3>

                <span>
                  Choose the files you want to update
                </span>

              </div>

            </div>

            <span className="required-label">
              Required
            </span>

          </div>


          {/* ================= UPLOAD BOX ================= */}

          <div className="upload-box">

            <div className="upload-file-icon">
              📄
            </div>

            <h4>
              Drag & Drop your files here
            </h4>

            <span className="or-text">
              or
            </span>

            <label className="choose-button">

              Choose Files

              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileUpload}
              />

            </label>

            <p>
              Supported PDF, DOCX, XLSX up to 20MB each
            </p>

          </div>


          {/* ================= SELECTED FILES ================= */}

          {files.length > 0 && (
            <>

              <div className="files-heading">

                <span>
                  Selected Files ({files.length})
                </span>

                <span className="all-ready">
                  ✓ All files processed
                </span>

              </div>


              <div className="file-list">

                {files.map((file, index) => (

                  <div
                    className="file-item"
                    key={`${file.name}-${index}`}
                  >

                    {/* FILE TYPE */}

                    <div className="file-type-icon">

                      {file.type.includes("PDF")
                        ? "PDF"
                        : file.type.includes("Excel")
                        ? "XLS"
                        : "DOC"}

                    </div>


                    {/* FILE INFORMATION */}

                    <div className="file-info">

                      <strong>
                        {file.name}
                      </strong>

                      <span>
                        {file.size} • {file.type}
                      </span>

                    </div>


                    {/* FILE ACTIONS */}

                    <div className="file-actions">

                      {/* STATUS */}

                      <span
                        className={
                          file.status === "Updated"
                            ? "success-icon updated-status"
                            : "success-icon"
                        }
                        title={file.status}
                      >
                        ✓
                      </span>


                      {/* VIEW CHANGES */}

                      {updated && (
                        <button
                          type="button"
                          className="view-changes-button"
                          onClick={() =>
                            viewChanges(file)
                          }
                          title="View changes"
                        >
                          👁
                        </button>
                      )}


                      {/* DOWNLOAD */}

                      <button
                        type="button"
                        className="download-file-button"
                        onClick={() =>
                          downloadFile(file.file)
                        }
                        title={
                          updated
                            ? "Download updated document"
                            : "Download document"
                        }
                      >
                        ↓
                      </button>


                      {/* DELETE */}

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() =>
                          removeFile(index)
                        }
                        title="Remove document"
                      >
                        🗑
                      </button>

                    </div>

                  </div>

                ))}

              </div>


              {/* ================= ANALYZE BUTTON ================= */}

              <button
                type="button"
                className="analyze-button"
                onClick={analyzeDocuments}
                disabled={analyzing}
              >

                <span>
                  ✦
                </span>

                {analyzing
                  ? "Analyzing Documents..."
                  : "Analyze Files"}

                <span className="arrow">
                  →
                </span>

              </button>

            </>
          )}

        </section>


        {/* ================= COMMON FIELDS ================= */}

        {files.length > 0 && (
          <section className="card">

            <div className="section-header">

              <div className="section-title">

                <div className="section-icon">
                  ▣
                </div>

                <div>

                  <h3>
                    2. Common Fields
                  </h3>

                  <span>
                    Detected across all documents
                  </span>

                </div>

              </div>


              <button
                type="button"
                className="add-field-button"
                onClick={addField}
              >
                + Add Field
              </button>

            </div>


            {/* INFORMATION */}

            <div className="info-box">

              <span className="info-icon">
                ⓘ
              </span>

              <p>
                Fields below are detected in all uploaded
                documents. Update the value once and it
                will be applied to every matching document.
              </p>

            </div>


            {/* FIELDS */}

            <div className="fields-container">

              {fields.map((field, index) => (

                <div
                  className="field-row"
                  key={`${field.name}-${index}`}
                >

                  <div className="field-top">

                    <label>
                      {field.name}
                    </label>

                    <span className="present-label">
                      Present in {files.length}/{files.length} files
                    </span>

                    <button
                      type="button"
                      className="remove-field"
                      onClick={() =>
                        removeField(index)
                      }
                    >
                      ✕ Remove
                    </button>

                  </div>


                  <input
                    type="text"
                    value={field.value}
                    onChange={(event) =>
                      handleFieldChange(
                        index,
                        event.target.value
                      )
                    }
                    placeholder={`Enter ${field.name}`}
                  />

                </div>

              ))}


              {fields.length === 0 &&
                !analyzing && (
                  <div className="no-fields-message">
                    Click "Analyze Files" to detect common fields.
                  </div>
                )}


              {analyzing && (
                <div className="no-fields-message">
                  Analyzing your documents...
                </div>
              )}

            </div>

          </section>
        )}


        {/* ================= UPDATE SUMMARY ================= */}

        {files.length > 0 && (
          <section className="card summary-card">

            <div className="section-header">

              <div className="section-title">

                <div className="section-icon">
                  ▣
                </div>

                <div>

                  <h3>
                    Update Summary
                  </h3>

                </div>

              </div>

            </div>


            <div className="summary-grid">

              <div className="summary-box">

                <span>
                  DOCUMENTS
                </span>

                <strong>
                  {files.length} Files
                </strong>

              </div>


              <div className="summary-box">

                <span>
                  FIELDS TO UPDATE
                </span>

                <strong>
                  {fields.length} Values
                </strong>

              </div>

            </div>


            {/* SUMMARY TAGS */}

            <div className="summary-tags">

              {fields.map((field, index) => (

                <span
                  key={`${field.name}-tag-${index}`}
                >
                  {field.name}
                </span>

              ))}

            </div>


            {/* WARNING */}

            <div className="warning-box">

              <span>
                🔒
              </span>

              <p>
                Your original documents will not be modified.
                Updated copies will be generated separately.
              </p>

            </div>


            {/* UPDATE BUTTON */}

            <button
              type="button"
              className="update-button"
              onClick={updateDocuments}
              disabled={
                updating ||
                analyzing ||
                files.length === 0 ||
                fields.length === 0
              }
            >

              <span>
                ✦
              </span>

              {updating
                ? "Updating Documents..."
                : updated
                ? "Documents Updated"
                : "Update All Documents"}

              <span>
                →
              </span>

            </button>


            {/* DOWNLOAD ALL */}

            {updated &&
              !updating && (
                <button
                  type="button"
                  className="download-button"
                  onClick={downloadAllDocuments}
                >

                  <span>
                    ↓
                  </span>

                  Download All Documents

                  <span>
                    →
                  </span>

                </button>
              )}

          </section>
        )}


        {/* ================= PROCESSING SECTION ================= */}

        {files.length > 0 && (
          <section className="processing-section">

            <div className="processing-header">

              <h3>
                DOCUMENT PROCESSING
              </h3>

              <span>
                {files.length} Documents • {fields.length} Fields
              </span>

            </div>


            <div className="processing-tabs">

              <button className="active-tab">
                Processing
              </button>

              <button>
                Completed
              </button>

              <button>
                Exported
              </button>

            </div>


            <div className="progress-area">

              <div className="progress-title">

                <div className="processing-name">

                  <span className="loading-icon">

                    {updating
                      ? "◌"
                      : updated
                      ? "✓"
                      : "○"}

                  </span>

                  <strong>

                    {updating
                      ? "Updating Documents..."
                      : updated
                      ? "Documents Updated Successfully"
                      : "Ready for Update"}

                  </strong>

                </div>

                <span>
                  {progress}%
                </span>

              </div>


              <div className="progress-bar">

                <div
                  className="progress-fill"
                  style={{
                    width: `${progress}%`,
                  }}
                ></div>

              </div>


              <div className="processing-file">

                <span>
                  📄
                </span>

                <div>

                  <strong>
                    {files[0]?.name ||
                      "No file selected"}
                  </strong>

                  <small>

                    {updating
                      ? "Applying common fields..."
                      : updated
                      ? "Updated successfully"
                      : "Waiting for update"}

                  </small>

                </div>

              </div>

            </div>


            {/* EXPORT DOWNLOAD */}

            {updated && (
              <div className="export-section">

                <div className="export-success">
                  ✓ All documents are ready for download
                </div>

                <button
                  type="button"
                  className="download-button"
                  onClick={downloadAllDocuments}
                >
                  ↓ Download All Documents
                </button>

              </div>
            )}

          </section>
        )}

      </main>


      {/* =====================================================
          VIEW CHANGES MODAL
          ===================================================== */}

      {viewingFile && (

        <div
          className="changes-modal-overlay"
          onClick={closeChanges}
        >

          <div
            className="changes-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* MODAL HEADER */}

            <div className="changes-modal-header">

              <div>

                <h3>
                  View Changes
                </h3>

                <p>
                  {viewingFile.name}
                </p>

              </div>

              <button
                type="button"
                className="close-modal-button"
                onClick={closeChanges}
              >
                ✕
              </button>

            </div>


            {/* CHANGES SUMMARY */}

            <div className="changes-summary">

              <span>
                ✓ {viewingFile.changes.length} fields changed
              </span>

              <span>
                Updated Document
              </span>

            </div>


            {/* CHANGES LIST */}

            <div className="changes-list">

              {viewingFile.changes.length > 0 ? (

                viewingFile.changes.map(
                  (change, index) => (

                    <div
                      className="change-item"
                      key={`${change.field}-${index}`}
                    >

                      <div className="change-field-name">
                        {change.field}
                      </div>


                      <div className="change-values">

                        <div className="old-value">

                          <span>
                            BEFORE
                          </span>

                          <p>
                            {change.before}
                          </p>

                        </div>


                        <div className="change-arrow">
                          →
                        </div>


                        <div className="new-value">

                          <span>
                            AFTER
                          </span>

                          <p>
                            {change.after}
                          </p>

                        </div>

                      </div>

                    </div>

                  )
                )

              ) : (

                <div className="no-changes">
                  No fields were changed for this document.
                </div>

              )}

            </div>


            {/* MODAL FOOTER */}

            <div className="changes-modal-footer">

              <button
                type="button"
                className="modal-close-button"
                onClick={closeChanges}
              >
                Close
              </button>

              <button
                type="button"
                className="modal-download-button"
                onClick={() =>
                  downloadUpdatedFile(
                    viewingFile
                  )
                }
              >
                ↓ Download Document
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default Home;