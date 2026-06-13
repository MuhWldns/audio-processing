/**
 * Validation middleware using Zod schemas
 * Validates req.body against a Zod schema and returns 400 on failure
 */

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    // Replace body with parsed/coerced values
    req.body = result.data;
    next();
  };
}
