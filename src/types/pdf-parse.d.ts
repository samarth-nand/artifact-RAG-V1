declare module 'pdf-parse' {
  function pdfParse(data: Buffer, options?: any): Promise<{
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }>;
  
  export default pdfParse;
}
