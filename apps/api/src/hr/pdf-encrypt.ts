import { spawn } from "node:child_process";

/**
 * Password-protect a PDF with native `qpdf` (design D2). `PdfService.renderHtml` emits an
 * unencrypted buffer, so the payslip worker pipes it through `qpdf --encrypt <pw> <pw> 256`
 * (AES-256) over stdin/stdout — no temp files, no npm native module. `qpdf` must be on
 * PATH (added to the devcontainer/prod image); a missing binary fails the worker fast.
 */
export function encryptPdf(pdf: Buffer, password: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("qpdf", [
      "--encrypt",
      password,
      password,
      "256",
      "--",
      "-", // input from stdin
      "-", // output to stdout
    ]);

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (err) =>
      reject(new Error(`qpdf failed to start (is it installed?): ${err.message}`)),
    );
    child.on("close", (code) => {
      // qpdf exit code 3 = warnings (still produced output); 0 = clean.
      if (code === 0 || code === 3) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`qpdf exited ${code}: ${Buffer.concat(errChunks).toString()}`));
      }
    });

    child.stdin.write(pdf);
    child.stdin.end();
  });
}
