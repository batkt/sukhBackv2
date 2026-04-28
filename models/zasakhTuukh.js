const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const zasakhTuukhSchema = new Schema(
  {
    // What was changed
    modelName: String, // e.g., "ajiltan", "geree", "baiguullaga"
    documentId: String, // The _id of the document that was changed
    collectionName: String, // The collection name (for organization-specific databases)
    
    // Who made the change
    ajiltniiId: String, // Employee ID who made the change
    ajiltniiNer: String, // Employee name
    ajiltniiNevtrekhNer: String, // Employee login name
    
    // What changed
    changes: [
      {
        field: String, // Field name that changed
        oldValue: Schema.Types.Mixed, // Old value
        newValue: Schema.Types.Mixed, // New value
      },
    ],
    
    // Original document creation date
    documentCreatedAt: Date, // Original creation date of the document being edited
    
    // Context
    baiguullagiinId: String, // Organization ID
    baiguullagiinRegister: String, // Organization register
    barilgiinId: String, // Building ID (if applicable)
    
    // Request info
    ip: String, // IP address
    useragent: Schema.Types.Mixed, // User agent info
    method: String, // HTTP method (PUT, PATCH, etc.)
    
    // Timestamps
    ognoo: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
zasakhTuukhSchema.index({ documentId: 1, modelName: 1 });
zasakhTuukhSchema.index({ ajiltniiId: 1 });
zasakhTuukhSchema.index({ baiguullagiinId: 1 });
zasakhTuukhSchema.index({ ognoo: -1 });
zasakhTuukhSchema.index({ modelName: 1, ognoo: -1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zasakhTuukh", zasakhTuukhSchema);
};
