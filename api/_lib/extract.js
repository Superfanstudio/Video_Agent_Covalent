// Extract plain text from an uploaded file buffer (txt / pdf / docx).
// Parsers are imported via a variable specifier so the client/config bundler
// leaves them as Node-only runtime imports (never bundled into the browser).

export async function extractText(buffer, name = "", mimetype = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();

  if (ext === "pdf" || mimetype === "application/pdf") {
    const pkg = "pdf-parse";
    const { PDFParse } = await import(pkg);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || "";
    } finally {
      await parser.destroy?.();
    }
  }

  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const pkg = "mammoth";
    const mod = await import(pkg);
    const mammoth = mod.default ?? mod;
    const res = await mammoth.extractRawText({ buffer });
    return res.value || "";
  }

  // .txt / .md / .csv / unknown → treat as UTF-8 text
  return buffer.toString("utf8");
}

export function isSupportedFile(name = "", mimetype = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return (
    ["txt", "md", "csv", "pdf", "docx"].includes(ext) ||
    mimetype === "application/pdf" ||
    mimetype.startsWith("text/") ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}
