// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.
import * as path from "../path/mod.ts";
import { ensureDir, ensureDirSync } from "./ensure_dir.ts";
import { isSubdir, getFileInfoType } from "./utils.ts";
import { assert } from "../testing/asserts.ts";

export interface CopyOptions {
  /**
   * overwrite existing file or directory. Default is `false`
   */
  overwrite?: boolean;
  /**
   * When `true`, will set last modification and access times to the ones of the
   * original source files.
   * When `false`, timestamp behavior is OS-dependent.
   * Default is `false`.
   */
  preserveTimestamps?: boolean;
}

async function ensureValidCopy(
  src: string,
  dest: string,
  options: CopyOptions,
  isCopyFolder = false
): Promise<Deno.FileInfo | undefined> {
  let destStat: Deno.FileInfo;

  try {
    destStat = await Deno.lstat(dest);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return;
    }
    throw err;
  }

  if (isCopyFolder && !destStat.isDirectory) {
    throw new Error(
      `Cannot overwrite non-directory '${dest}' with directory '${src}'.`
    );
  }
  if (!options.overwrite) {
    throw new Error(`'${dest}' already exists.`);
  }

  return destStat;
}

function ensureValidCopySync(
  src: string,
  dest: string,
  options: CopyOptions,
  isCopyFolder = false
): Deno.FileInfo | undefined {
  let destStat: Deno.FileInfo;
  try {
    destStat = Deno.lstatSync(dest);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return;
    }
    throw err;
  }

  if (isCopyFolder && !destStat.isDirectory) {
    throw new Error(
      `Cannot overwrite non-directory '${dest}' with directory '${src}'.`
    );
  }
  if (!options.overwrite) {
    throw new Error(`'${dest}' already exists.`);
  }

  return destStat;
}

/* copy file to dest */
async function copyFile(
  src: string,
  dest: string,
  options: CopyOptions
): Promise<void> {
  await ensureValidCopy(src, dest, options);
  await Deno.copyFile(src, dest);
  if (options.preserveTimestamps) {
    const statInfo = await Deno.stat(src);
    assert(statInfo.accessed != null, `statInfo.accessed is unavailable`);
    assert(statInfo.modified != null, `statInfo.modified is unavailable`);
    await Deno.utime(dest, statInfo.accessed, statInfo.modified);
  }
}
/* copy file to dest synchronously */
function copyFileSync(src: string, dest: string, options: CopyOptions): void {
  ensureValidCopySync(src, dest, options);
  Deno.copyFileSync(src, dest);
  if (options.preserveTimestamps) {
    const statInfo = Deno.statSync(src);
    assert(statInfo.accessed != null, `statInfo.accessed is unavailable`);
    assert(statInfo.modified != null, `statInfo.modified is unavailable`);
    Deno.utimeSync(dest, statInfo.accessed, statInfo.modified);
  }
}

/* copy symlink to dest */
async function copySymLink(
  src: string,
  dest: string,
  options: CopyOptions
): Promise<void> {
  await ensureValidCopy(src, dest, options);
  const originSrcFilePath = await Deno.readlink(src);
  const type = getFileInfoType(await Deno.lstat(src));
  await Deno.symlink(originSrcFilePath, dest, type);
  if (options.preserveTimestamps) {
    const statInfo = await Deno.lstat(src);
    assert(statInfo.accessed != null, `statInfo.accessed is unavailable`);
    assert(statInfo.modified != null, `statInfo.modified is unavailable`);
    await Deno.utime(dest, statInfo.accessed, statInfo.modified);
  }
}

/* copy symlink to dest synchronously */
function copySymlinkSync(
  src: string,
  dest: string,
  options: CopyOptions
): void {
  ensureValidCopySync(src, dest, options);
  const originSrcFilePath = Deno.readlinkSync(src);
  const type = getFileInfoType(Deno.lstatSync(src));
  Deno.symlinkSync(originSrcFilePath, dest, type);
  if (options.preserveTimestamps) {
    const statInfo = Deno.lstatSync(src);
    assert(statInfo.accessed != null, `statInfo.accessed is unavailable`);
    assert(statInfo.modified != null, `statInfo.modified is unavailable`);
    Deno.utimeSync(dest, statInfo.accessed, statInfo.modified);
  }
}

/* copy folder from src to dest. */
async function copyDir(
  src: string,
  dest: string,
  options: CopyOptions
): Promise<void> {
  const destStat = await ensureValidCopy(src, dest, options, true);

  if (!destStat) {
    await ensureDir(dest);
  }

  if (options.preserveTimestamps) {
    const srcStatInfo = await Deno.stat(src);
    assert(srcStatInfo.accessed != null, `statInfo.accessed is unavailable`);
    assert(srcStatInfo.modified != null, `statInfo.modified is unavailable`);
    await Deno.utime(dest, srcStatInfo.accessed, srcStatInfo.modified);
  }

  for await (const file of Deno.readdir(src)) {
    const srcPath = path.join(src, file.name);
    const destPath = path.join(dest, path.basename(srcPath as string));
    if (file.isDirectory) {
      await copyDir(srcPath, destPath, options);
    } else if (file.isFile) {
      await copyFile(srcPath, destPath, options);
    } else if (file.isSymlink) {
      await copySymLink(srcPath, destPath, options);
    }
  }
}

/* copy folder from src to dest synchronously */
function copyDirSync(src: string, dest: string, options: CopyOptions): void {
  const destStat = ensureValidCopySync(src, dest, options, true);

  if (!destStat) {
    ensureDirSync(dest);
  }

  if (options.preserveTimestamps) {
    const srcStatInfo = Deno.statSync(src);
    assert(srcStatInfo.accessed != null, `statInfo.accessed is unavailable`);
    assert(srcStatInfo.modified != null, `statInfo.modified is unavailable`);
    Deno.utimeSync(dest, srcStatInfo.accessed, srcStatInfo.modified);
  }

  for (const file of Deno.readdirSync(src)) {
    assert(file.name != null, "file.name must be set");
    const srcPath = path.join(src, file.name);
    const destPath = path.join(dest, path.basename(srcPath as string));
    if (file.isDirectory) {
      copyDirSync(srcPath, destPath, options);
    } else if (file.isFile) {
      copyFileSync(srcPath, destPath, options);
    } else if (file.isSymlink) {
      copySymlinkSync(srcPath, destPath, options);
    }
  }
}

/**
 * Copy a file or directory. The directory can have contents. Like `cp -r`.
 * Requires the `--allow-read` and `--alow-write` flag.
 * @param src the file/directory path.
 *            Note that if `src` is a directory it will copy everything inside
 *            of this directory, not the entire directory itself
 * @param dest the destination path. Note that if `src` is a file, `dest` cannot
 *             be a directory
 * @param options
 */
export async function copy(
  src: string,
  dest: string,
  options: CopyOptions = {}
): Promise<void> {
  src = path.resolve(src);
  dest = path.resolve(dest);

  if (src === dest) {
    throw new Error("Source and destination cannot be the same.");
  }

  const srcStat = await Deno.lstat(src);

  if (srcStat.isDirectory && isSubdir(src, dest)) {
    throw new Error(
      `Cannot copy '${src}' to a subdirectory of itself, '${dest}'.`
    );
  }

  if (srcStat.isDirectory) {
    await copyDir(src, dest, options);
  } else if (srcStat.isFile) {
    await copyFile(src, dest, options);
  } else if (srcStat.isSymlink) {
    await copySymLink(src, dest, options);
  }
}

/**
 * Copy a file or directory. The directory can have contents. Like `cp -r`.
 * Requires the `--allow-read` and `--alow-write` flag.
 * @param src the file/directory path.
 *            Note that if `src` is a directory it will copy everything inside
 *            of this directory, not the entire directory itself
 * @param dest the destination path. Note that if `src` is a file, `dest` cannot
 *             be a directory
 * @param options
 */
export function copySync(
  src: string,
  dest: string,
  options: CopyOptions = {}
): void {
  src = path.resolve(src);
  dest = path.resolve(dest);

  if (src === dest) {
    throw new Error("Source and destination cannot be the same.");
  }

  const srcStat = Deno.lstatSync(src);

  if (srcStat.isDirectory && isSubdir(src, dest)) {
    throw new Error(
      `Cannot copy '${src}' to a subdirectory of itself, '${dest}'.`
    );
  }

  if (srcStat.isDirectory) {
    copyDirSync(src, dest, options);
  } else if (srcStat.isFile) {
    copyFileSync(src, dest, options);
  } else if (srcStat.isSymlink) {
    copySymlinkSync(src, dest, options);
  }
}
