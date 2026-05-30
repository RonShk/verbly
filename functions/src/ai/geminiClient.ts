import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
} from "@google/genai";
import {z} from "zod";

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (_client) return _client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-api-key-here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to functions/.env or set it as an environment variable."
    );
  }

  _client = new GoogleGenAI({apiKey});
  return _client;
}

export const GEMINI_MODEL = "gemini-3-flash-preview";

const BASE_CONFIG: GenerateContentConfig = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.MEDIUM,
  },
};

/**
 * Sends a prompt to Gemini with a structured JSON response constraint
 * derived from a Zod schema. Parses and validates the response.
 *
 * Callers only need to provide a prompt and a Zod schema -- the JSON
 * Schema for Gemini is generated automatically via z.toJSONSchema().
 */
export async function generateStructured<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const ai = getClient();
  const jsonSchema = z.toJSONSchema(schema);

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config: {
      ...BASE_CONFIG,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
    contents: [{role: "user", parts: [{text: prompt}]}],
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const raw = JSON.parse(text);
  return schema.parse(raw);
}

/**
 * Streams a structured JSON response from Gemini. Each text delta from the
 * stream is passed to `onText`; callers are responsible for accumulating and
 * parsing partial JSON (see StreamingJsonArrayExtractor).
 *
 * Generation defaults to MINIMAL thinking: question generation is a creative
 * task that does not benefit from deep reasoning, and lower thinking means the
 * first tokens (and therefore the first question) arrive much sooner.
 */
export async function generateStructuredStream<T>(prompt: string, schema: z.ZodType<T>, onText: (textDelta: string) => void | Promise<void>, thinkingLevel: ThinkingLevel = ThinkingLevel.MINIMAL): Promise<void> {
  const ai = getClient();
  const jsonSchema = z.toJSONSchema(schema);

  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    config: {
      thinkingConfig: {thinkingLevel},
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
    contents: [{role: "user", parts: [{text: prompt}]}],
  });

  for await (const chunk of stream) {
    const textDelta = chunk.text;
    if (textDelta) await onText(textDelta);
  }
}
