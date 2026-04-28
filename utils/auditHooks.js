/**
 * Utility to add audit hooks to any Mongoose model
 * This automatically tracks edits and deletes for any model
 */

const { logEdit, logDelete } = require("../services/auditService");
const { getCurrentRequest } = require("../middleware/requestContext");

/**
 * Add audit hooks to a Mongoose schema
 * @param {Schema} schema - Mongoose schema
 * @param {String} modelName - Name of the model (e.g., "ajiltan", "geree")
 */
function addAuditHooks(schema, modelName) {
  // Pre-save hook to capture old document before save()
  schema.pre("save", async function () {
    if (this.isNew) {
      // New document - nothing to track
      return;
    }
    if (!this._oldDoc && this._id) {
      try {
        // Get the original document from database
        // Use the model from the connection, not this.constructor
        const Model = this.constructor;
        this._oldDoc = await Model.findById(this._id).lean();
        if (!this._oldDoc) {
          console.warn(`⚠️ [AUDIT] Could not find old document for ${modelName}:${this._id}`);
        }
      } catch (err) {
        console.error(`❌ [AUDIT] Error getting old doc for ${modelName}:${this._id}`, err.message);
      }
    }
  });

  // Pre-update hook to capture old document
  schema.pre("findOneAndUpdate", async function () {
    if (!this._oldDoc) {
      try {
        this._oldDoc = await this.model.findOne(this.getQuery()).lean();
      } catch (err) {
        // Ignore errors
      }
    }
  });

  schema.pre("updateOne", async function () {
    if (!this._oldDoc) {
      try {
        this._oldDoc = await this.model.findOne(this.getQuery()).lean();
      } catch (err) {
        // Ignore errors
      }
    }
  });

  // Post-save hook for audit logging
  schema.post("save", async function (doc) {
    if (this.isNew) {
      // New document - nothing to track
      return;
    }
    if (this._oldDoc) {
      try {
        const { db } = require("zevbackv2");
        const req = getCurrentRequest();
        
        if (!req) {
          // Silently skip if no request context
          return;
        }
        
        const oldDoc = this._oldDoc;
        const newDoc = doc.toObject ? doc.toObject() : doc;
        
        // Extract context from document
        const additionalContext = {
          baiguullagiinId: doc.baiguullagiinId || null,
          barilgiinId: doc.barilgiinId || null,
        };
        
        await logEdit(
          req,
          db,
          modelName,
          doc._id.toString(),
          oldDoc,
          newDoc,
          additionalContext
        );
      } catch (err) {
        console.error(`❌ [AUDIT] Error logging ${modelName} save:`, err.message);
      }
    }
  });

  // Post-update hook for audit logging
  schema.post("findOneAndUpdate", async function (doc) {
    if (doc && this._oldDoc) {
      try {
        const { db } = require("zevbackv2");
        const req = getCurrentRequest();
        
        if (req) {
          const oldDoc = this._oldDoc;
          const newDoc = doc.toObject ? doc.toObject() : doc;
          
          // Extract context from document
          const additionalContext = {
            baiguullagiinId: doc.baiguullagiinId || null,
            barilgiinId: doc.barilgiinId || null,
          };
          
          await logEdit(
            req,
            db,
            modelName,
            doc._id.toString(),
            oldDoc,
            newDoc,
            additionalContext
          );
        }
      } catch (err) {
        console.error(`❌ [AUDIT] Error logging ${modelName} edit:`, err.message);
      }
    }
  });

  schema.post("updateOne", async function () {
    try {
      const doc = await this.model.findOne(this.getQuery()).lean();
      if (doc && this._oldDoc) {
        const { db } = require("zevbackv2");
        const req = getCurrentRequest();
        
        if (req) {
          const oldDoc = this._oldDoc;
          const newDoc = doc;
          
          const additionalContext = {
            baiguullagiinId: doc.baiguullagiinId || null,
            barilgiinId: doc.barilgiinId || null,
          };
          
          await logEdit(
            req,
            db,
            modelName,
            doc._id.toString(),
            oldDoc,
            newDoc,
            additionalContext
          );
        }
      }
    } catch (err) {
      console.error(`❌ [AUDIT] Error logging ${modelName} edit:`, err.message);
    }
  });

  // Pre-delete hook to capture document before deletion
  schema.pre("findOneAndDelete", async function () {
    if (!this._docToDelete) {
      try {
        this._docToDelete = await this.model.findOne(this.getQuery()).lean();
      } catch (err) {
        console.error(`❌ [AUDIT] Error getting doc to delete for ${modelName}:`, err.message);
      }
    }
  });

  // Post-delete hook for audit logging
  schema.post("findOneAndDelete", async function (doc) {
    // Use the document from pre-hook if available, otherwise use the returned doc
    const deletedDoc = this._docToDelete || (doc ? (doc.toObject ? doc.toObject() : doc) : null);
    
    if (deletedDoc) {
      try {
        const { db } = require("zevbackv2");
        const req = getCurrentRequest();
        
        if (!req) {
          // Silently skip if no request context
          return;
        }
        
        const additionalContext = {
          baiguullagiinId: deletedDoc.baiguullagiinId || null,
          barilgiinId: deletedDoc.barilgiinId || null,
        };
        
        await logDelete(
          req,
          db,
          modelName,
          deletedDoc._id.toString(),
          deletedDoc,
          "hard",
          "Deleted via findOneAndDelete",
          additionalContext
        );
      } catch (err) {
        console.error(`❌ [AUDIT] Error logging ${modelName} delete:`, err.message);
      }
    }
  });

  schema.post("deleteOne", { document: true, query: true }, async function () {
    try {
      const doc = this.getQuery ? await this.model.findOne(this.getQuery()).lean() : this;
      if (doc) {
        const { db } = require("zevbackv2");
        const req = getCurrentRequest();
        
        if (req) {
          const deletedDoc = doc;
          
          const additionalContext = {
            baiguullagiinId: doc.baiguullagiinId || null,
            barilgiinId: doc.barilgiinId || null,
          };
          
          await logDelete(
            req,
            db,
            modelName,
            doc._id.toString(),
            deletedDoc,
            "hard",
            null,
            additionalContext
          );
        }
      }
    } catch (err) {
      console.error(`❌ [AUDIT] Error logging ${modelName} delete:`, err.message);
    }
  });
}



module.exports = {
  addAuditHooks,
};
