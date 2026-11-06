import { format24hDateTime, fmtDateVN, localDateKey } from './storage';

/**
 * Pure TypeScript helper to safely parse EXIF metadata (specifically DateTimeOriginal / DateTime / DateTimeDigitized)
 * directly from ArrayBuffer / DataView without buggy dependencies like exif-js (which crashes with "Can't find variable: n"
 * in strict mode).
 */
export async function getExifDateTimeFromBlob(file: Blob | File): Promise<string | null> {
  try {
    const arrayBuffer = await file.slice(0, 131072).arrayBuffer(); // read first 128KB which contains EXIF
    const view = new DataView(arrayBuffer);

    // Verify JPEG SOI (0xFFD8)
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) {
      return null;
    }

    let offset = 2;
    const length = view.byteLength;

    while (offset < length - 4) {
      const marker = view.getUint16(offset, false);
      offset += 2;

      // APP1 marker (0xFFE1) contains EXIF
      if (marker === 0xFFE1) {
        const segLength = view.getUint16(offset, false);
        offset += 2;

        // Check for 'Exif\0\0' (0x45786966 0x0000)
        if (
          view.getUint32(offset, false) === 0x45786966 &&
          view.getUint16(offset + 4, false) === 0x0000
        ) {
          const tiffStart = offset + 6;
          return parseTiffExifDateTime(view, tiffStart, segLength - 8);
        }
        offset += segLength - 2;
      } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFF00 && marker !== 0xFFD9) {
        // Other JPEG marker, skip segment
        const segLength = view.getUint16(offset, false);
        offset += segLength;
      } else {
        break;
      }
    }
  } catch (e) {
    console.warn('Error reading EXIF binary:', e);
  }
  return null;
}

function parseTiffExifDateTime(view: DataView, tiffStart: number, maxLen: number): string | null {
  try {
    if (tiffStart + 8 > view.byteLength) return null;

    // Check endianness: 'II' (0x4949) = Little Endian, 'MM' (0x4D4D) = Big Endian
    const endianTag = view.getUint16(tiffStart, false);
    const littleEndian = endianTag === 0x4949;

    if (!littleEndian && endianTag !== 0x4D4D) {
      return null;
    }

    // Check 42 magic number
    if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002A) {
      return null;
    }

    const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
    if (ifd0Offset < 8 || tiffStart + ifd0Offset + 2 > view.byteLength) {
      return null;
    }

    let exifSubIfdOffset: number | null = null;
    let dateTimeTagVal: string | null = null;

    // Read IFD0
    const ifd0Entries = view.getUint16(tiffStart + ifd0Offset, littleEndian);
    let entryPtr = tiffStart + ifd0Offset + 2;

    for (let i = 0; i < ifd0Entries; i++) {
      if (entryPtr + 12 > view.byteLength) break;
      const tag = view.getUint16(entryPtr, littleEndian);

      if (tag === 0x0132) {
        // DateTime (IFD0)
        dateTimeTagVal = readAsciiTag(view, entryPtr, tiffStart, littleEndian);
      } else if (tag === 0x8769) {
        // ExifIFDPointer
        exifSubIfdOffset = view.getUint32(entryPtr + 8, littleEndian);
      }
      entryPtr += 12;
    }

    // Read Exif SubIFD if present
    if (exifSubIfdOffset && tiffStart + exifSubIfdOffset + 2 <= view.byteLength) {
      const subEntries = view.getUint16(tiffStart + exifSubIfdOffset, littleEndian);
      let subPtr = tiffStart + exifSubIfdOffset + 2;

      for (let i = 0; i < subEntries; i++) {
        if (subPtr + 12 > view.byteLength) break;
        const tag = view.getUint16(subPtr, littleEndian);

        if (tag === 0x9003) {
          // DateTimeOriginal (highest priority)
          const dtOriginal = readAsciiTag(view, subPtr, tiffStart, littleEndian);
          if (dtOriginal) return dtOriginal;
        } else if (tag === 0x9004 && !dateTimeTagVal) {
          // DateTimeDigitized
          dateTimeTagVal = readAsciiTag(view, subPtr, tiffStart, littleEndian);
        }
        subPtr += 12;
      }
    }

    return dateTimeTagVal;
  } catch (err) {
    console.warn('parseTiffExifDateTime error:', err);
    return null;
  }
}

function readAsciiTag(
  view: DataView,
  entryPtr: number,
  tiffStart: number,
  littleEndian: boolean
): string | null {
  try {
    const type = view.getUint16(entryPtr + 2, littleEndian);
    const count = view.getUint32(entryPtr + 4, littleEndian);

    if (type !== 2 || count <= 1 || count > 64) return null; // type 2 = ASCII

    let valOffset: number;
    if (count <= 4) {
      valOffset = entryPtr + 8;
    } else {
      valOffset = tiffStart + view.getUint32(entryPtr + 8, littleEndian);
    }

    if (valOffset + count > view.byteLength) return null;

    let res = '';
    for (let c = 0; c < count - 1; c++) {
      const charCode = view.getUint8(valOffset + c);
      if (charCode === 0) break;
      res += String.fromCharCode(charCode);
    }
    return res.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Safely extract EXIF photo capture time or fall back to file modified time.
 * Never throws ReferenceError: Can't find variable: n.
 */
export async function getSafePhotoCaptureTime(file: File): Promise<string> {
  try {
    const rawExif = await getExifDateTimeFromBlob(file);
    if (rawExif) {
      return format24hDateTime(rawExif);
    }
  } catch (e) {
    console.warn('Could not read EXIF date:', e);
  }
  return format24hDateTime(file.lastModified);
}

/**
 * Anti-cheat date verification helper for student uploaded photo
 */
export async function verifyPhotoExifDateSafe(
  file: File
): Promise<{ isValid: boolean; photoDate: string; captureDateTime?: string; errorMsg?: string }> {
  try {
    const rawExif = await getExifDateTimeFromBlob(file);
    const today = localDateKey(); // "YYYY-MM-DD"
    const captureDateTime = rawExif ? format24hDateTime(rawExif) : format24hDateTime(file.lastModified);

    if (rawExif) {
      const parts = rawExif.split(' ')[0].split(':');
      if (parts.length === 3) {
        const photoDate = `${parts[0]}-${parts[1]}-${parts[2]}`;
        if (photoDate !== today) {
          return {
            isValid: false,
            photoDate,
            errorMsg: `Cảnh báo chống ảnh giả: Ảnh này được tạo vào ngày ${fmtDateVN(
              photoDate
            )}, không phải ngày hôm nay (${fmtDateVN(today)}). Hệ thống phát hiện đây là ảnh cũ từ thư viện!`,
          };
        }
        return { isValid: true, photoDate, captureDateTime };
      }
    }

    const fileDate = new Date(file.lastModified).toISOString().slice(0, 10);
    if (fileDate !== today) {
      return {
        isValid: false,
        photoDate: fileDate,
        errorMsg: `Cảnh báo: Thời gian sửa file ảnh (${fmtDateVN(
          fileDate
        )}) không khớp với ngày hôm nay (${fmtDateVN(today)}). Vui lòng chụp ảnh mới trực tiếp tại lớp!`,
      };
    }

    return { isValid: true, photoDate: today, captureDateTime };
  } catch (err: any) {
    const today = localDateKey();
    return { isValid: true, photoDate: today, captureDateTime: format24hDateTime(file.lastModified) };
  }
}

import { getDayData } from './storage';

/**
 * Generates a unique fingerprint for a base64 image or file content string
 * to detect photo reuse across students.
 */
export function getPhotoFingerprint(base64Str: string | null | undefined): string {
  if (!base64Str) return '';
  const clean = String(base64Str).replace(/^data:image\/\w+;base64,/, '').trim();
  if (!clean) return '';
  const len = clean.length;
  if (len < 100) return clean;
  const s1 = clean.substring(0, 50);
  const s2 = clean.substring(Math.floor(len / 2) - 25, Math.floor(len / 2) + 25);
  const s3 = clean.substring(len - 50);
  return `${len}:${s1}:${s2}:${s3}`;
}

/**
 * Checks if the given photo base64 string has already been used by ANY OTHER student
 * in the same class on the specified date.
 */
export function checkDuplicatePhotoInClass(
  selectedLop: string,
  dateStr: string,
  targetStudentId: string,
  newPhotoBase64: string | null | undefined
): { isDuplicate: boolean; usedByStudentName?: string; usedByStudentId?: string } {
  if (!selectedLop || !newPhotoBase64 || !targetStudentId) return { isDuplicate: false };

  const newFp = getPhotoFingerprint(newPhotoBase64);
  if (!newFp) return { isDuplicate: false };

  const dayData = getDayData(selectedLop, dateStr);
  if (!dayData || !dayData.records) return { isDuplicate: false };

  const cleanTargetId = targetStudentId.trim().toLowerCase();

  for (const [sId, rec] of Object.entries(dayData.records)) {
    if (sId.trim().toLowerCase() === cleanTargetId) continue; // Skip same student

    const proxyFp = getPhotoFingerprint(rec.proxyPhoto);
    const excuseFp = getPhotoFingerprint(rec.excusePhoto);

    if ((proxyFp && proxyFp === newFp) || (excuseFp && excuseFp === newFp)) {
      return {
        isDuplicate: true,
        usedByStudentId: sId,
        usedByStudentName: rec.name || sId,
      };
    }
  }

  return { isDuplicate: false };
}
