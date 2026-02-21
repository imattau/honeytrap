import type { ZodType } from 'zod';

export async function parseJsonResponse<T>(
  response: Response,
  schema: ZodType<T>,
  errorMessage: string
): Promise<T> {
  try {
    const raw = await response.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(errorMessage);
    return parsed.data;
  } catch {
    throw new Error(errorMessage);
  }
}

export function parseJsonString<T>(json: string, schema: ZodType<T>, errorMessage: string): T {
  try {
    const raw = JSON.parse(json) as unknown;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(errorMessage);
    return parsed.data;
  } catch {
    throw new Error(errorMessage);
  }
}
