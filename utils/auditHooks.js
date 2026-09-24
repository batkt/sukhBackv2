/**
 * Utility to add audit hooks to any Mongoose model
 * This automatically tracks edits and deletes for any model
 */


/**
 * Add audit hooks to a Mongoose schema
 * @param {Schema} schema - Mongoose schema
 * @param {String} modelName - Name of the model (e.g., "ajiltan", "geree")
 */
function addAuditHooks(schema, modelName) {
  // Бүх hook одоо глобал plugin-д (utils/auditPlugin.js) шилжсэн — энд
  // зөвхөн түүхэнд харагдах model-ийн нэрийг тэмдэглэнэ. Давхар hook
  // залгавал нэг засвар хоёр удаа бичигдэнэ.
  schema.__auditModelName = modelName;
}

module.exports = {
  addAuditHooks,
};
