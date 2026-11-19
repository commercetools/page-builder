/** Where media bytes live. The service talks to this interface; Google Cloud Storage is the one implementation. */

export interface PutInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StoredObject {
  key: string;
  /** Where a browser (the editor, and later a storefront) reads the object from. */
  url: string;
  size: number;
  contentType: string;
}

export interface MediaFile {
  key: string;
  url: string;
  name: string;
  size?: number;
  contentType?: string;
  createdAt?: string;
}

export interface ListInput {
  prefix: string;
  limit: number;
  cursor?: string;
}

export interface ListPage {
  files: MediaFile[];
  /** The store's own continuation token; `null` on the last page. */
  nextCursor: string | null;
}

export interface MediaStore {
  put(input: PutInput): Promise<StoredObject>;
  list(input: ListInput): Promise<ListPage>;
}
