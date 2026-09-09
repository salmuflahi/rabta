import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { calculate, cleanLinks, colorValues, contrast, csvToJson, jsonToCsv, formatJson, encodeText, ENCODINGS, transformText, TEXT_ACTIONS, convertUnit, UNITS } from './utility-core.js';
const annotation = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const text = z.string().max(200_000).describe("Explicit text to process, up to 200,000 characters.");
function run(work: () => unknown) {
  try {
    const result = work();
    return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Could not process this input.' }] };
  }
}
/** Pure transformations over explicitly supplied input. No clipboard, files, network or native commands. */
export function registerUtilityTools(server: McpServer) {
  server.registerTool('calculate', { title: 'Calculate', description: 'Evaluate bounded arithmetic with parentheses and powers. Never executes code.', inputSchema: { expression: z.string().max(1000).describe("Arithmetic expression.") }, annotations: annotation }, ({ expression }) => run(() => calculate(expression)));
  server.registerTool('clean_links', { title: 'Clean links', description: 'Remove tracking parameters from explicit HTTP(S) links, one per line. Does not open any link.', inputSchema: { links: text, extra_parameters: z.string().max(2000).default('').describe('Additional comma-separated tracking parameters.') }, annotations: annotation }, ({ links, extra_parameters }) => run(() => cleanLinks(links, extra_parameters)));
  server.registerTool('transform_text', { title: 'Transform text', description: 'Clean whitespace, change case or sort explicitly supplied text.', inputSchema: { text, action: z.enum(TEXT_ACTIONS).describe("Text transformation to apply.") }, annotations: annotation }, ({ text, action }) => run(() => transformText(text, action)));
  server.registerTool('convert_data', { title: 'Convert data', description: 'Format/minify JSON or convert flat CSV and JSON records. Reports invalid input without executing it.', inputSchema: { text, action: z.enum(['Format JSON', 'Compact JSON', 'CSV to JSON', 'JSON to CSV']).describe('Conversion to perform.') }, annotations: annotation }, ({ text, action }) => run(() => action === 'CSV to JSON' ? csvToJson(text) : action === 'JSON to CSV' ? jsonToCsv(text) : formatJson(text, action === 'Compact JSON')));
  server.registerTool('encode_decode', { title: 'Encode or decode text', description: 'Transform supplied text using Base64, URL components or HTML entities.', inputSchema: { text, action: z.enum(ENCODINGS).describe("Encoding operation.") }, annotations: annotation }, ({ text, action }) => run(() => encodeText(text, action)));
  server.registerTool('convert_units', { title: 'Convert units', description: 'Convert length, weight, temperature, time or data. Use list_unit_conversions for exact category and unit names.', inputSchema: { value: z.number().finite().describe("Finite amount to convert."), category: z.string().max(80).describe("Exact name from list_unit_conversions."), from: z.string().max(80).describe("Exact name from list_unit_conversions."), to: z.string().max(80).describe("Exact name from list_unit_conversions.") }, annotations: annotation }, ({ value, category, from, to }) => run(() => convertUnit(value, category, from, to)));
  server.registerTool('list_unit_conversions', { title: 'Available unit conversions', description: 'List supported categories and exact unit names.', inputSchema: {}, annotations: annotation }, () => run(() => ({ ...Object.fromEntries(Object.entries(UNITS).map(([name, values]) => [name, Object.keys(values)])), Temperature: ['Celsius', 'Fahrenheit', 'Kelvin'] })));
  server.registerTool('color_contrast', { title: 'Check color contrast', description: 'Compute color formats and WCAG contrast ratio for two hex colors.', inputSchema: { foreground: z.string().max(16).describe("Three or six digit hex color."), background: z.string().max(16).describe("Three or six digit hex color.") }, annotations: annotation }, ({ foreground, background }) => run(() => ({ foreground: colorValues(foreground), background: colorValues(background), ratio: contrast(foreground, background) })));
}
