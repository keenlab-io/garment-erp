import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { ValidationError } from "./errors/app-exception.js";

/**
 * Load an uploaded spreadsheet as a workbook, accepting BOTH `.xlsx` and `.csv`.
 *
 * Every import endpoint here advertises both formats — in its contract summary and in the file
 * picker's `accept` — and a machine exporting CSV is the ordinary case. Calling `xlsx.load`
 * unconditionally made a CSV throw unhandled, surfacing as `500 Internal server error` rather
 * than anything the user could act on. That happened in two places independently, which is why
 * this lives here rather than in either module.
 *
 * The format is sniffed rather than trusted from a filename: `.xlsx` is a zip, so it always
 * begins with the "PK" local-file-header magic; anything else is read as delimited text. A file
 * neither reader can parse is a 422 — bad input is not a server fault.
 */
export async function loadWorkbook(buffer: Buffer, what = "file"): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const isXlsx = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
  try {
    if (isXlsx) {
      // exceljs's typings predate the generic `Buffer<ArrayBufferLike>`; the value is a
      // real Node Buffer either way.
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } else {
      await wb.csv.read(Readable.from(buffer));
    }
  } catch {
    throw new ValidationError(`Couldn't read the ${what}. Upload an .xlsx workbook or a .csv file.`);
  }
  return wb;
}
