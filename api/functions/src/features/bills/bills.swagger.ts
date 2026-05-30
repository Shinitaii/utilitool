export const billsPaths = {
  "/bills/ocr": {
    post: {
      summary: "Extract data from utility bill image via OCR",
      description: "Processes a utility bill image (Meralco or Manila Water) and extracts billing period, consumption, and rate information using Gemini AI.",
      tags: ["Bills"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/OcrBillRequest",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Successfully extracted bill data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OcrBillResponse",
              },
            },
          },
        },
        "400": {
          description: "Invalid image URL or failed to extract data",
        },
        "401": {
          description: "Unauthorized",
        },
      },
      security: [{BearerAuth: []}],
    },
  },
};

export const schemas = {
  OcrBillRequest: {
    type: "object",
    required: ["image_url"],
    properties: {
      image_url: {
        type: "string",
        format: "uri",
        description: "URL of the bill image to process",
        example: "https://storage.googleapis.com/bucket/bills/bill.jpg",
      },
    },
  },
  OcrBillResponse: {
    type: "object",
    properties: {
      billing_start_date: {
        type: "string",
        format: "date",
        description: "Start date of the billing period (YYYY-MM-DD)",
        example: "2026-04-17",
      },
      billing_end_date: {
        type: "string",
        format: "date",
        description: "End date of the billing period (YYYY-MM-DD)",
        example: "2026-05-16",
      },
      billing_consumption: {
        type: "number",
        description: "Total consumption in kWh or cubic meters",
        example: 145.5,
      },
      billing_rate: {
        type: "number",
        description: "Rate per unit (PHP/kWh or PHP/cubic meter)",
        example: 12.5,
      },
      raw_amount: {
        type: "number",
        description: "Total amount charged",
        example: 1818.75,
      },
    },
  },
};
