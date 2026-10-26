/**
 * Manages review session state for changed files in the workspace.
 *
 * Tracks files that have been inspected and marked as "Reviewed" by the developer.
 * Purely local and in-memory for the current IDE session.
 */
class ReviewSessionManager {
  private reviewedFiles = new Set<string>();

  public markReviewed(filePath: string): void {
    this.reviewedFiles.add(this.normalize(filePath));
  }

  public unmarkReviewed(filePath: string): void {
    this.reviewedFiles.delete(this.normalize(filePath));
  }

  public toggleReviewed(filePath: string): boolean {
    const key = this.normalize(filePath);
    if (this.reviewedFiles.has(key)) {
      this.reviewedFiles.delete(key);
      return false;
    } else {
      this.reviewedFiles.add(key);
      return true;
    }
  }

  public isReviewed(filePath: string): boolean {
    return this.reviewedFiles.has(this.normalize(filePath));
  }

  public clear(): void {
    this.reviewedFiles.clear();
  }

  public getReviewedCount(): number {
    return this.reviewedFiles.size;
  }

  private normalize(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
  }
}

export const reviewManager = new ReviewSessionManager();
