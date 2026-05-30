export const paths = {
  "/image-extraction/readings": {
    post: {
      tags: ["Image Extraction"],
      summary: "Extract meter reading data from image",
      description: "Uses Gemini Vision to extract structured reading data from a meter photo",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                image_url: {
                  type: "string",
                  format: "uri",
                  description: "URL of the meter photo (data URL or HTTPS)",
                },
              },
              required: ["image_url"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Successfully extracted reading data",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: {type: "string"},
                  reading_amount: {type: "number"},
                  reading_date: {type: "string"},
                  image_url: {type: "string"},
                  created_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
        },
        400: {
          description: "Invalid image URL or extraction failed",
        },
      },
      security: [{BearerAuth: []}],
    },
  },
  "/image-extraction/billings": {
    post: {
      tags: ["Image Extraction"],
      summary: "Extract billing data from utility bill photo",
      description: "Uses Gemini Vision to extract dates, consumption, and rate from a utility bill",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                image_url: {
                  type: "string",
                  format: "uri",
                  description: "URL of the utility bill photo (data URL or HTTPS)",
                },
              },
              required: ["image_url"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Successfully extracted billing data",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  billing_start_date: {type: "string", format: "date"},
                  billing_end_date: {type: "string", format: "date"},
                  billing_consumption: {type: "number"},
                  billing_rate: {type: "number"},
                  raw_amount: {type: "string"},
                  created_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
        },
        400: {
          description: "Invalid image URL or extraction failed",
        },
      },
      security: [{BearerAuth: []}],
    },
  },
};
