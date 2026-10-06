const Joi = require("joi");
const { AppError } = require("../middleware/errorHandler");

/**
 * Higher-order Joi validation middleware (BE-01)
 * @param {Joi.ObjectSchema} schema
 * @param {'body' | 'query' | 'params'} property
 */
function validate(schema, property = "body") {
  return async (req, res, next) => {
    try {
      const validated = await schema.validateAsync(req[property], {
        abortEarly: false,
        stripUnknown: true,
      });
      req[property] = validated;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Common Schemas
const supervisorRegistrationSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  phone: Joi.string().trim().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  regionId: Joi.string().trim().lowercase().alphanum().min(2).max(50).required(),
});

const supervisorActionSchema = Joi.object({
  reason: Joi.string().trim().min(5).max(500).required(),
});

const supervisorOptionalReasonSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow("").optional(),
});

const resolveEventSchema = Joi.object({
  resolutionNotes: Joi.string().trim().max(1000).allow("").optional(),
  outcome: Joi.string()
    .valid("RESOLVED_ON_SCENE", "FALSE_ALARM", "TRANSFERRED", "CANCELLED", "ESCALATED")
    .default("RESOLVED_ON_SCENE"),
});

const createRegionSchema = Joi.object({
  id: Joi.string().trim().lowercase().alphanum().min(2).max(50).required(),
  name: Joi.string().trim().min(2).max(100).required(),
  center: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
  }).required(),
  zoom: Joi.number().integer().min(1).max(20).default(12),
  adminUid: Joi.string().trim().allow("").optional(),
  ackSlaSeconds: Joi.number().integer().min(10).max(3600).default(60),
  staleSeconds: Joi.number().integer().min(60).max(86400).default(300),
  fallbackRegionId: Joi.string().trim().lowercase().alphanum().allow("").optional(),
});

module.exports = {
  validate,
  supervisorRegistrationSchema,
  supervisorActionSchema,
  supervisorOptionalReasonSchema,
  resolveEventSchema,
  createRegionSchema,
};
