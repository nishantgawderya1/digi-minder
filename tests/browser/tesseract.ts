import { readWithTesseract as realRead } from "../../src/lib/tesseract-client.ts";

export const readWithTesseract: typeof realRead = (...args) => {
  if (sessionStorage.getItem("tesseract-unavailable") === "true")
    return Promise.reject(new Error("Local OCR unavailable in this test"));
  return realRead(...args);
};
