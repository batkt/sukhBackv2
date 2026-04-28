const Ajiltan = require("../models/ajiltan");

/**
 * Validates that a value only contains alphanumeric characters, hyphens (-), and slashes (/)
 * Does not allow dots (.) or other special characters like !@#$%^&*() etc.
 * @param {string} value - The value to validate
 * @param {string} fieldName - The name of the field being validated (for error messages)
 * @returns {string} - Error message if invalid, null if valid
 */
function shalguurValidate(value, fieldName = "Талбар") {
  if (!value || typeof value !== "string") {
    return null; // Allow empty/null values, let required validation handle that
  }

  // Only allow: letters (a-z, A-Z, Mongolian Cyrillic), numbers (0-9), hyphens (-), and slashes (/)
  // Regex: ^[a-zA-Z0-9А-Яа-яӨөҮүёЁ\-\/]+$
  const validPattern = /^[a-zA-Z0-9А-Яа-яӨөҮүёЁ\-\/]+$/;

  if (!validPattern.test(value)) {
    return `${fieldName} талбарт зөвхөн үсэг, тоо, таслал (-) болон зураас (/) ашиглах боломжтой. Цэг (.) болон бусад тусгай тэмдэгт ашиглахыг хориглоно.`;
  }

  return null; // Valid
}

/**
 * Middleware to validate shalguur fields in request body
 * Validates fields specified in the fields array
 */
function shalguurFieldValidate(fields = ["register", "dans", "dansDugaar", "ibanDugaar"]) {
  return (req, res, next) => {
    const errors = [];

    for (const field of fields) {
      let value = req.body[field];
      let fieldName = field;

      // Handle nested fields like dans.dugaar
      if (field.includes(".")) {
        const parts = field.split(".");
        let nested = req.body;
        for (let i = 0; i < parts.length - 1; i++) {
          nested = nested?.[parts[i]];
        }
        value = nested?.[parts[parts.length - 1]];
        fieldName = field;
      }

      if (value) {
        const error = shalguurValidate(value, fieldName);
        if (error) {
          errors.push(error);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        aldaa: errors.join(" "),
      });
    }

    next();
  };
}

async function gereeZasakhShalguur(req, res, next) {
  const { db } = require("zevbackv2");
  if (req.body.nevtersenAjiltniiToken && req.body.barilgiinId) {
    var ajiltan = await Ajiltan(db.erunkhiiKholbolt).findById(
      req.body.nevtersenAjiltniiToken.id
    );
    if (
      ajiltan.erkh == "Admin" ||
      (ajiltan.tokhirgoo &&
        ajiltan.tokhirgoo.gereeZasakhErkh &&
        ajiltan.tokhirgoo.gereeZasakhErkh.length > 0 &&
        ajiltan.tokhirgoo.gereeZasakhErkh.includes(req.body.barilgiinId))
    ) {
      next();
    } else next(new Error("Энэ гэрээ засах үйлдлийн эрхгүй байна!"));
  } else next(new Error("Энэ гэрээ засах үйлдлийн эрхгүй байна!"));
}

async function gereeSungakhShalguur(req, res, next) {
  const { db } = require("zevbackv2");
  if (req.body.nevtersenAjiltniiToken && req.body.barilgiinId) {
    var ajiltan = await Ajiltan(db.erunkhiiKholbolt).findById(
      req.body.nevtersenAjiltniiToken.id
    );
    if (
      ajiltan.erkh == "Admin" ||
      (ajiltan.tokhirgoo &&
        ajiltan.tokhirgoo.gereeSungakhErkh &&
        ajiltan.tokhirgoo.gereeSungakhErkh.length > 0 &&
        ajiltan.tokhirgoo.gereeSungakhErkh.includes(req.body.barilgiinId))
    ) {
      next();
    } else next(new Error("Энэ гэрээ сунгах үйлдлийн эрхгүй байна!"));
  } else next(new Error("Энэ гэрээ сунгах үйлдлийн эрхгүй байна!"));
}

async function gereeSergeekhShalguur(req, res, next) {
  const { db } = require("zevbackv2");
  if (req.body.nevtersenAjiltniiToken && req.body.barilgiinId) {
    var ajiltan = await Ajiltan(db.erunkhiiKholbolt).findById(
      req.body.nevtersenAjiltniiToken.id
    );
    if (
      ajiltan.erkh == "Admin" ||
      (ajiltan.tokhirgoo &&
        ajiltan.tokhirgoo.gereeSergeekhErkh &&
        ajiltan.tokhirgoo.gereeSergeekhErkh.length > 0 &&
        ajiltan.tokhirgoo.gereeSergeekhErkh.includes(req.body.barilgiinId))
    ) {
      next();
    } else next(new Error("Энэ гэрээ сэргээх үйлдлийн эрхгүй байна!"));
  } else next(new Error("Энэ гэрээ сэргээх үйлдлийн эрхгүй байна!"));
}

async function gereeTsutslakhShalguur(req, res, next) {
  const { db } = require("zevbackv2");
  if (req.body.nevtersenAjiltniiToken && req.body.barilgiinId) {
    var ajiltan = await Ajiltan(db.erunkhiiKholbolt).findById(
      req.body.nevtersenAjiltniiToken.id
    );
    if (
      ajiltan.erkh == "Admin" ||
      (ajiltan.tokhirgoo &&
        ajiltan.tokhirgoo.gereeTsutslakhErkh &&
        ajiltan.tokhirgoo.gereeTsutslakhErkh.length > 0 &&
        ajiltan.tokhirgoo.gereeTsutslakhErkh.includes(req.body.barilgiinId))
    ) {
      next();
    } else next(new Error("Энэ гэрээ цуцлах үйлдлийн эрхгүй байна!"));
  } else next(new Error("Энэ гэрээ цуцлах үйлдлийн эрхгүй байна!"));
}

async function guilgeeUstgakhShalguur(req, res, next) {
  const { db } = require("zevbackv2");
  if (req.body.nevtersenAjiltniiToken && req.body.barilgiinId) {
    var ajiltan = await Ajiltan(db.erunkhiiKholbolt).findById(
      req.body.nevtersenAjiltniiToken.id
    );
    if (
      ajiltan.erkh == "Admin" ||
      (ajiltan.tokhirgoo &&
        ajiltan.tokhirgoo.guilgeeUstgakhErkh &&
        ajiltan.tokhirgoo.guilgeeUstgakhErkh.length > 0 &&
        ajiltan.tokhirgoo.guilgeeUstgakhErkh.includes(req.body.barilgiinId))
    ) {
      next();
    } else next(new Error("Энэ үйлдлийн эрхгүй байна!"));
  } else next(new Error("Энэ үйлдлийн эрхгүй байна!"));
}

module.exports = {
  gereeZasakhShalguur,
  gereeSungakhShalguur,
  gereeSergeekhShalguur,
  gereeTsutslakhShalguur,
  guilgeeUstgakhShalguur,
  shalguurValidate,
  shalguurFieldValidate,
};
