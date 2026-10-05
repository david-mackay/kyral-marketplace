import archiver from "archiver";
import { PassThrough } from "node:stream";

import type { Document } from "@/server/db/schema";
import { getObjectBuffer } from "@/server/storage/s3";

export interface DeliverableFile {
  documentId: string;
  key: string;
  fileName: string;
  contentType: string;
}

/**
 * The version of a document a buyer may receive. Analyzed files only ship
 * their de-identified derivative; files that couldn't be de-identified are
 * never delivered. Uploads from before intake existed ship as-is.
 */
export function deliverableFile(doc: Document): DeliverableFile | null {
  if (doc.deidObjectKey) {
    return {
      documentId: doc.id,
      key: doc.deidObjectKey,
      fileName: doc.deidFileName ?? `${doc.id}.csv`,
      contentType: doc.deidContentType ?? "text/csv",
    };
  }
  if (!doc.profile && doc.objectKey) {
    return {
      documentId: doc.id,
      key: doc.objectKey,
      fileName: doc.originalFileName,
      contentType: doc.contentType,
    };
  }
  return null;
}

/** Stream a ZIP of deliverable files, de-duplicating names. */
export function zipResponse(files: DeliverableFile[], downloadName: string): Response {
  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.pipe(passthrough);

  void (async () => {
    const usedNames = new Set<string>();
    for (const file of files) {
      try {
        const buffer = await getObjectBuffer({ key: file.key });
        let name = file.fileName;
        if (usedNames.has(name)) {
          const ext = name.lastIndexOf(".");
          const base = ext > 0 ? name.slice(0, ext) : name;
          const suffix = ext > 0 ? name.slice(ext) : "";
          let i = 2;
          while (usedNames.has(`${base}_${i}${suffix}`)) i++;
          name = `${base}_${i}${suffix}`;
        }
        usedNames.add(name);
        archive.append(buffer, { name });
      } catch {
        // Skip files that fail to fetch
      }
    }
    await archive.finalize();
  })();

  const stream = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
    },
  });
}
