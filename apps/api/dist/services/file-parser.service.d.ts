export interface ParsedSheet {
    name: string;
    headers: string[];
    rows: Array<Record<string, string>>;
}
export interface ParsedFileResult {
    fileFormat: 'XLSX' | 'CSV' | 'PDF';
    sizeBytes: number;
    sheetNames: string[];
    selectedSheet: string;
    headers: string[];
    rows: Array<Record<string, string>>;
    pdfMetadata?: {
        hasSelectableText: boolean;
        requiresOcrOrManualReview: boolean;
        extractedRawText: string;
    };
}
export declare function parseUploadedFile(params: {
    fileName: string;
    base64Content: string;
    importKind: string;
    selectedSheet?: string;
}): ParsedFileResult;
