import api, { buildPath } from "./client";
import type { ReceiptScan } from "../types";

export type ReceiptImage = {
  uri: string;
  name: string;
  type: string;
};

export const receipts = {
  scan: (userId: string, image: ReceiptImage) => {
    const formData = new FormData();
    formData.append("file", image as unknown as Blob);
    return api
      .post<ReceiptScan>(
        buildPath("/users/{user_id}/receipts/scan", { user_id: userId }),
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      )
      .then((r) => r.data);
  },
};