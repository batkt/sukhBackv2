const express = require("express");
const router = express.Router();
const multer = require("multer");
const { tokenShalgakh, crud, UstsanBarimt } = require("zevbackv2");
const aldaa = require("../components/aldaa");
const { db } = require("zevbackv2");
const PdfFile = require("../models/pdfFile");

// Use crud for basic CRUD operations (metadata only, no file content)
crud(router, "pdfFile", PdfFile, UstsanBarimt);

// Configure multer for memory storage (PDF files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for PDFs
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Зөвхөн PDF файл оруулах боломжтой!"), false);
    }
  },
});

/**
 * POST /pdfFile/upload - Upload PDF file
 * Body: multipart/form-data
 * - file: PDF file (required)
 * - ner: Name/title for the PDF (optional)
 * - tailbar: Description (optional)
 */
router.post("/pdfFile/upload", tokenShalgakh, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new aldaa("PDF файл оруулаагүй байна!");
    }

    // Check if it's actually a PDF
    if (req.file.mimetype !== "application/pdf") {
      throw new aldaa("Зөвхөн PDF файл оруулах боломжтой!");
    }

    // Use multi-tenant model with erunkhiiKholbolt connection
    const PdfFileModel = PdfFile(db.erunkhiiKholbolt);

    const pdfFile = new PdfFileModel({
      ner: req.body.ner || req.file.originalname,
      originalNer: req.file.originalname,
      pdfFile: req.file.buffer,
      contentType: req.file.mimetype,
      hemjee: req.file.size,
      tailbar: req.body.tailbar || "",
    });

    await pdfFile.save();

    res.status(201).json({
      success: true,
      message: "PDF файл амжилттай хадгалагдлаа",
      data: {
        id: pdfFile._id,
        ner: pdfFile.ner,
        originalNer: pdfFile.originalNer,
        hemjee: pdfFile.hemjee,
        tailbar: pdfFile.tailbar,
        createdAt: pdfFile.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});


/**
 * GET /pdfFile/:id/file - Get PDF file by ID (returns actual PDF file)
 * This endpoint returns the PDF file content, not metadata
 */
router.get("/pdfFile/:id/file", tokenShalgakh, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Use multi-tenant model with erunkhiiKholbolt connection
    const PdfFileModel = PdfFile(db.erunkhiiKholbolt);

    const pdfFile = await PdfFileModel.findById(id);

    if (!pdfFile) {
      return res.status(404).json({
        success: false,
        message: "PDF файл олдсонгүй",
      });
    }

    // Set headers for PDF download/view
    res.setHeader("Content-Type", pdfFile.contentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${pdfFile.originalNer}"`
    );
    res.setHeader("Content-Length", pdfFile.hemjee);

    // Send PDF buffer
    res.send(pdfFile.pdfFile);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

