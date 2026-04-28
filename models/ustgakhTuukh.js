const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ustgakhTuukhSchema = new Schema(
  {
    // What was deleted
    modelName: String, // e.g., "ajiltan", "geree", "baiguullaga"
    documentId: String, // The _id of the document that was deleted
    collectionName: String, // The collection name (for organization-specific databases)
    
    // Document data before deletion (snapshot)
    deletedData: Schema.Types.Mixed, // Full document snapshot before deletion
    documentCreatedAt: Date, // Original creation date of the deleted document
    
    // Who deleted it
    ajiltniiId: String, // Employee ID who deleted
    ajiltniiNer: String, // Employee name
    ajiltniiNevtrekhNer: String, // Employee login name
    
    // Context
    baiguullagiinId: String, // Organization ID
    baiguullagiinRegister: String, // Organization register
    barilgiinId: String, // Building ID (if applicable)
    
    // Request info
    ip: String, // IP address
    useragent: Schema.Types.Mixed, // User agent info
    method: String, // HTTP method (DELETE, etc.)
    
    // Deletion reason/type
    deletionType: {
      type: String,
      enum: ["hard", "soft"], // hard = actual delete, soft = marked as cancelled
    },
    reason: String, // Optional reason for deletion
    
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
ustgakhTuukhSchema.index({ documentId: 1, modelName: 1 });
ustgakhTuukhSchema.index({ ajiltniiId: 1 });
ustgakhTuukhSchema.index({ baiguullagiinId: 1 });
ustgakhTuukhSchema.index({ ognoo: -1 });
ustgakhTuukhSchema.index({ modelName: 1, ognoo: -1 });
ustgakhTuukhSchema.index({ deletionType: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("ustgakhTuukh", ustgakhTuukhSchema);
};
