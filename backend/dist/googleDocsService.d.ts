import 'dotenv/config';
export declare class GoogleDocsService {
    static archiveConsultation(data: any, userEmail: string): Promise<any>;
    static exportToDoc(courseId: number, userEmail: string): Promise<{
        success: boolean;
    }>;
}
//# sourceMappingURL=googleDocsService.d.ts.map