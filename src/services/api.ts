import { User, Release, Enquiry, NotificationLog, AdminStats, ReleaseStatus, WithdrawalRequest, ArtistCredit } from '../types';

export interface PlanUsageResponse {
  planId: 'free' | 'starter';
  planName: string;
  planExpiresAt: string | null;
  usage: { releasesThisMonth: number; artists: number };
  limits: { releasesPerMonth: number | null; artists: number | null };
}

export interface EmailCampaignRecipientView {
  id: string;
  email: string;
  name: string;
  status: string;
  group?: 'current' | 'legacy';
}

export interface EmailCampaignHistoryItem {
  id: string;
  subject: string;
  sender: string;
  createdAt: string;
  status: 'sending' | 'completed' | 'partial' | 'failed';
  recipients: Array<{ userId: string; email: string; name: string; status: 'pending' | 'sent' | 'failed'; sentAt?: string; error?: string }>;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = this.getToken();
  }

  setToken(token: string | null) {
    // Keep the token only in memory. The server also sets an HttpOnly session cookie,
    // so normal page refreshes do not require exposing the session to JavaScript storage.
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  clearLocalToken(): void {
    this.token = null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(endpoint, { ...options, cache: 'no-store', credentials: 'include', headers });
    } catch (networkError: any) {
      const detail = networkError?.message || 'Network request failed';
      throw new Error(`Could not reach the STB Academy server (${endpoint}). Check that the Render service is live and try again. Details: ${detail}`);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data as T;
  }

  async registerArtist(payload: {email:string;name:string;realFirstName?:string;realSurname?:string;artistName:string;phone?:string;country?:string}): Promise<{message:string;email:string}> {
    return this.request('/api/auth/register-artist', { method:'POST', body:JSON.stringify(payload) });
  }
  async deleteAccount(): Promise<{success:boolean;message:string}> { return this.request('/api/account', { method:'DELETE' }); }
  async updateClientRelease(id:string,payload:any):Promise<{message:string;release:Release}> { return this.request(`/api/releases/${id}/client-edit`,{method:'PATCH',body:JSON.stringify(payload)}); }
  async deleteClientRelease(id:string):Promise<{success:boolean;message:string}> { return this.request(`/api/releases/${id}/client-delete`,{method:'DELETE'}); }
  async removeReleaseArtwork(id:string):Promise<{message:string;release:Release}> { return this.request(`/api/releases/${id}/artwork`,{method:'DELETE'}); }
  async replaceReleaseArtwork(id:string,file:File):Promise<{message:string;release:Release}> { const form=new FormData();form.append('artwork',file);return this.request(`/api/releases/${id}/artwork`,{method:'POST',body:form}); }
  async updateClientVideoSubmission(id:string,payload:{videoTitle:string;description:string;videoUrl:string;sourceDownloadLinkAccessible:boolean}):Promise<{message:string;submission:any}> { return this.request(`/api/video-submissions/${id}/client-edit`,{method:'PATCH',body:JSON.stringify(payload)}); }
  async replaceVideoArtwork(id:string,file:File):Promise<{message:string;submission:any}> { const form=new FormData();form.append('artwork',file);return this.request(`/api/admin/video-submissions/${id}/artwork`,{method:'POST',body:form}); }
  async removeVideoArtwork(id:string):Promise<{message:string;submission:any}> { return this.request(`/api/admin/video-submissions/${id}/artwork`,{method:'DELETE'}); }
  async deleteClientVideoSubmission(id:string):Promise<{success:boolean;message:string}> { return this.request(`/api/video-submissions/${id}`,{method:'DELETE'}); }
  async getClientMessages():Promise<{messages:any[]}> { return this.request('/api/messages'); }
  async sendClientMessage(message:string):Promise<{message:any}> { return this.request('/api/messages',{method:'POST',body:JSON.stringify({message})}); }
  async getAdminMessages():Promise<{threads:Array<{userId:string;userName:string;userEmail:string;messages:any[]} >}> { return this.request('/api/admin/messages'); }
  async sendAdminMessage(userId:string,message:string):Promise<{message:any}> { return this.request(`/api/admin/messages/${userId}`,{method:'POST',body:JSON.stringify({message})}); }

  async getSiteSettings(): Promise<{ settings: { logoUrl?: string; socialLinks?: Array<{ platform: string; url: string }> } }> {
    return this.request('/api/site-settings');
  }
  async saveSiteSettings(settings: { logoUrl: string; socialLinks: Array<{ platform: string; url: string }> }): Promise<{ message: string; settings: any }> {
    return this.request('/api/admin/site-settings', { method: 'PUT', body: JSON.stringify(settings) });
  }
  async uploadSiteLogo(file: File): Promise<{ message: string; logoUrl: string }> {
    const formData = new FormData(); formData.append('artwork', file);
    return this.request('/api/admin/site-settings/logo', { method: 'POST', body: formData });
  }

  // Auth
  async getAuthConfig(): Promise<{ provider: string; otpLength: number }> {
    return this.request<{ provider: string; otpLength: number }>('/api/auth/config');
  }

  async requestLoginOtp(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }


  async verifyLoginOtp(email: string, code?: string, accessToken?: string): Promise<{ token: string; user: User }> {
    const data = await this.request<{ token: string; user: User }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code, accessToken }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/api/auth/me');
  }

  async getContract(): Promise<{ accepted: boolean; contractText: string; acceptedAt?: string; signature?: string; version: string }> { return this.request('/api/contract'); }
  async acceptContract(signature: string): Promise<{ message: string; acceptedAt: string; signature: string; contractText: string; version: string }> { return this.request('/api/contract/accept', { method: 'POST', body: JSON.stringify({ signature }) }); }

  async getPlanUsage(): Promise<PlanUsageResponse> {
    return this.request<PlanUsageResponse>('/api/payments/plan');
  }

  async initializePlanPayment(planId: 'starter'): Promise<{ authorizationUrl: string; reference: string; planId: string; amount: number }> {
    return this.request('/api/payments/paystack/initialize', { method: 'POST', body: JSON.stringify({ planId }) });
  }

  async verifyPlanPayment(reference: string): Promise<{ message: string; user: User; plan: PlanUsageResponse }> {
    return this.request('/api/payments/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) });
  }

  async setSpotifyProfileClaimed(claimed: boolean): Promise<{ message: string; user: User }> {
    return this.request<{ message: string; user: User }>('/api/auth/spotify-profile-claim', {
      method: 'PATCH',
      body: JSON.stringify({ claimed }),
    });
  }

  async logout(): Promise<void> {
    try {
      await this.request<{ message: string }>('/api/auth/logout', { method: 'POST' });
    } catch (_) {
      // Clear the in-memory token even if the network request fails.
    }
    this.setToken(null);
  }


  async forgotPassword(email: string): Promise<{ message: string; demoToken?: string }> {
    return this.request<{ message: string; demoToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(data: { token: string; password: string; confirmPassword: string }): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // File Uploads
  async uploadArtwork(file: File, dimensions?: { width: number; height: number }): Promise<{
    fileUrl: string;
    filename: string;
    storedFilename: string;
    size: number;
    dimensions?: { width: number; height: number };
  }> {
    const formData = new FormData();
    formData.append('artwork', file);
    if (dimensions) {
      formData.append('width', dimensions.width.toString());
      formData.append('height', dimensions.height.toString());
    }

    return this.request('/api/upload/artwork', {
      method: 'POST',
      body: formData,
    });
  }

  async uploadAudio(file: File): Promise<{
    fileUrl: string;
    filename: string;
    storedFilename: string;
    fileSize: number;
  }> {
    const formData = new FormData();
    formData.append('audio', file);

    return this.request('/api/upload/audio', {
      method: 'POST',
      body: formData,
    });
  }

  async getArtistLibrary(): Promise<{ artists: ArtistCredit[] }> {
    return this.request('/api/artists');
  }

  async saveArtist(artist: Partial<ArtistCredit>): Promise<{ artist: ArtistCredit; artists: ArtistCredit[] }> {
    return this.request('/api/artists', { method: 'POST', body: JSON.stringify(artist) });
  }

  // Releases
  async getReleases(): Promise<{ releases: Release[] }> {
    return this.request<{ releases: Release[] }>('/api/releases');
  }

  async deleteRelease(id: string): Promise<{ success: boolean; message: string }> { return this.request(`/api/releases/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

  async getRelease(id: string): Promise<{ release: Release }> {
    return this.request<{ release: Release }>(`/api/releases/${id}`);
  }

  async createRelease(payload: Partial<Release>): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>('/api/releases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async resubmitCorrectedRelease(id: string, payload: Partial<Release>): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${encodeURIComponent(id)}/corrections-resubmit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateReleaseWorkflowStatus(id: string, status: 'Delivered' | 'In Distribution' | 'Rejected', note?: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/workflow-status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
  }

  // Admin Approval / Denial System
  async approveRelease(id: string, note?: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  async getVevoApplications(): Promise<{ applications: any[] }> { return this.request('/api/vevo/applications'); }


  async uploadVideo(file: File): Promise<{ fileUrl: string; filename: string; storedFilename: string; fileSize: number }> {
    const formData = new FormData(); formData.append('video', file);
    return this.request('/api/upload/video', { method: 'POST', body: formData });
  }
  async submitVideoSubmission(payload: any): Promise<{ message: string; submission: any }> { return this.request('/api/video-submissions', { method: 'POST', body: JSON.stringify(payload) }); }
  async getVideoSubmissions(): Promise<{ submissions: any[] }> { return this.request('/api/video-submissions'); }
  async deleteVideoSubmission(id: string): Promise<{ success: boolean; message: string }> { return this.request(`/api/admin/video-submissions/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  async updateVideoSubmission(id: string, payload: { status?: 'Pending Review'|'Approved'|'Corrections Required'|'Denied'|'Rejected'|'Delivered'|'In Distribution'; adminNote?: string; grossRoyaltyAmount?: number }): Promise<{ message: string; submission: any }> { return this.request(`/api/admin/video-submissions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); }

  async updatePreSaveLinks(id: string, links: Array<{ id?: string; label: string; url: string }>): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/presave-links`, {
      method: 'PATCH',
      body: JSON.stringify({ links }),
    });
  }

  async updateReleaseRoyalty(id: string, amount: number): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/royalty`, {
      method: 'PATCH',
      body: JSON.stringify({ amount }),
    });
  }

  async updateReleaseCodes(id: string, payload: { isrc?: string; upc?: string; tracks?: Array<{id:string;isrc:string}> }): Promise<{ release: Release }> {
    return this.request(`/api/releases/${id}/codes`, { method: 'PATCH', body: JSON.stringify(payload) });
  }
  async savePayPalProfile(payload: { email?: string; mobile?: string; username?: string; paypalMeUrl?: string }): Promise<{ linked: boolean; payoutProfile: any }> {
    return this.request('/api/account/paypal-profile', { method: 'PUT', body: JSON.stringify(payload) });
  }
  async getAdminRoyaltyAdmins(): Promise<{ admins: Array<{id:string;name:string;email:string;adminRoyaltyAllocation:number;payoutProfile?:any}> }> {
    return this.request('/api/admin/royalties/admins');
  }
  async updateAdminRoyaltyAllocation(id: string, amount: number): Promise<{ user: User }> {
    return this.request(`/api/admin/royalties/admin-allocation/${id}`, { method: 'PATCH', body: JSON.stringify({ amount }) });
  }
  async getAdminPayoutProfiles():Promise<{profiles:Array<{userId:string;name:string;email:string;role:string;payoutProfile:any}>}> { return this.request('/api/admin/royalties/payout-profiles'); }
  async getAdminRoyaltyOverview(): Promise<{grossRoyalty:number;normalAdminShare:number;superAdminShare:number;eligibleReleases:number}> {
    return this.request('/api/admin/royalties/overview');
  }
  async requestPayPalWithdrawal(amount: number): Promise<{message:string;withdrawal:WithdrawalRequest;summary:any}> {
    return this.request('/api/royalties/withdrawals', { method: 'POST', body: JSON.stringify({ amount }) });
  }

  async getRoyaltySummary(): Promise<{ totalEarnings: number; pendingAmount: number; paidAmount: number; availableAmount: number; withdrawals: WithdrawalRequest[] }> {
    return this.request('/api/royalties/summary');
  }

  async requestRoyaltyWithdrawal(payload: {
    amount: number; bankName: string; accountHolder: string; accountNumber: string; branchCode: string;
    accountType?: WithdrawalRequest['accountType']; notes?: string; paymentReference?: string; liabilityAcknowledged?: boolean;
  }): Promise<{ message: string; withdrawal: WithdrawalRequest; summary: { totalEarnings: number; pendingAmount: number; paidAmount: number; availableAmount: number } }> {
    return this.request('/api/royalties/withdrawals', { method: 'POST', body: JSON.stringify(payload) });
  }

  async completeRelease(id: string, note?: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  async denyRelease(id: string, reason: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async requestCorrections(id: string, note: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/request-corrections`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  async requestTakedown(id: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/takedown-request`, { method: 'POST' });
  }

  async processTakedown(id: string, status: 'Takedown Processing' | 'Takedown Completed', note?: string): Promise<{ message: string; release: Release }> {
    return this.request<{ message: string; release: Release }>(`/api/releases/${id}/takedown-process`, { method: 'POST', body: JSON.stringify({ status, note }) });
  }

  // Generate a temporary signed download ticket (for authorized admin or release owner)
  async createSignedDownloadTicket(
    releaseId: string,
    assetType: 'artwork' | 'track' | 'document',
    assetId?: string
  ): Promise<{
    success: boolean;
    downloadUrl: string;
    filename: string;
    expiresAt: number;
    contentType: string;
  }> {
    return this.request<{
      success: boolean;
      downloadUrl: string;
      filename: string;
      expiresAt: number;
      contentType: string;
    }>(`/api/releases/${releaseId}/download-ticket`, {
      method: 'POST',
      body: JSON.stringify({
        assetType,
        trackId: assetType === 'track' ? assetId : undefined,
        documentId: assetType === 'document' ? assetId : undefined,
      }),
    });
  }

  // Securely trigger a same-origin download ticket, then let the browser navigate
  // to it. The server redirects to a short-lived R2 URL with attachment headers.
  // This avoids fetch/blob CORS failures when the object is hosted on Cloudflare R2.
  async downloadAsset(
    releaseId: string,
    assetType: 'artwork' | 'track' | 'document',
    assetId?: string,
    _fallbackFilename?: string
  ): Promise<void> {
    try {
      const ticket = await this.createSignedDownloadTicket(releaseId, assetType, assetId);
      window.location.assign(new URL(ticket.downloadUrl, window.location.origin).toString());
    } catch (err: any) {
      console.error('Download failure:', err);
      if (err.message && (
        err.message.includes('permission') ||
        err.message.includes('expired') ||
        err.message.includes('no longer exists') ||
        err.message.includes('legacy') ||
        err.message.includes('persistent storage')
      )) {
        throw err;
      }
      throw new Error(err?.message || "We couldn't download this file. Please try again.");
    }
  }

  // Document Upload
  async uploadDocument(file: File): Promise<{
    success: boolean;
    message: string;
    filename: string;
    storedFilename: string;
    fileUrl: string;
    fileSize: number;
  }> {
    const formData = new FormData();
    formData.append('document', file);
    return this.request('/api/upload/document', {
      method: 'POST',
      body: formData,
    });
  }

  getArtworkDownloadUrl(releaseId: string): string {
    return `/api/releases/${releaseId}/download-artwork`;
  }

  getTrackDownloadUrl(releaseId: string, trackId: string): string {
    return `/api/releases/${releaseId}/download-track/${trackId}`;
  }

  getDocumentDownloadUrl(releaseId: string): string {
    return `/api/releases/${releaseId}/download-document`;
  }

  async createClientEnquiry(payload: { subject: string; message: string }): Promise<{ message: string; enquiry: Enquiry }> {
    return this.request<{ message: string; enquiry: Enquiry }>('/api/enquiries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getPublicShareRelease(refNumber: string): Promise<{ release: any }> {
    return this.request<{ release: any }>(`/api/public/share/${refNumber}`);
  }

  // Admin Client Management
  async getAdminStats(): Promise<{ stats: AdminStats }> {
    return this.request<{ stats: AdminStats }>('/api/admin/stats');
  }

  async getAdminClients(): Promise<{ clients: User[] }> {
    return this.request<{ clients: User[] }>('/api/admin/clients');
  }

  async getEmailCampaignRecipients(): Promise<{ recipients: EmailCampaignRecipientView[] }> {
    return this.request('/api/admin/email-campaigns/recipients');
  }

  async getEmailCampaigns(): Promise<{ campaigns: EmailCampaignHistoryItem[] }> {
    return this.request('/api/admin/email-campaigns');
  }

  async sendEmailCampaignTest(payload: { subject: string; message: string }): Promise<{ message: string; recipient: string }> {
    return this.request('/api/admin/email-campaigns/test', { method: 'POST', body: JSON.stringify(payload) });
  }

  async sendEmailCampaign(payload: { subject: string; message: string; recipientIds: string[] }): Promise<{ campaignId: string; status: string; sent: number; failed: number; total: number; message: string }> {
    return this.request('/api/admin/email-campaigns/send', { method: 'POST', body: JSON.stringify(payload) });
  }

  async registerClient(payload: { email: string; name: string; realFirstName?: string; realSurname?: string; phone?: string; country?: string }): Promise<{ message: string; client: User }> {
    return this.request<{ message: string; client: User }>('/api/admin/clients/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateClient(id: string, payload: Partial<User>): Promise<{ message: string; client: User }> {
    return this.request<{ message: string; client: User }>(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async adminAccessClientAccount(clientId: string): Promise<{ message: string; token: string; client: User }> {
    return this.request<{ message: string; token: string; client: User }>(`/api/admin/clients/${clientId}/access-session`, {
      method: 'POST',
    });
  }

  async getClientReleases(clientId: string): Promise<{ client: User; releases: Release[] }> {
    return this.request<{ client: User; releases: Release[] }>(`/api/admin/clients/${clientId}/releases`);
  }

  async getAdminRoyaltySummary(): Promise<{totalEarnings:number;pendingAmount:number;paidAmount:number;availableAmount:number;withdrawals:WithdrawalRequest[]}> {
    return this.request('/api/admin/royalties/summary');
  }
  async getAdminRoyaltyWithdrawals(): Promise<{ withdrawals: WithdrawalRequest[] }> {
    return this.request('/api/admin/royalties/withdrawals');
  }

  async updateRoyaltyWithdrawal(id: string, payload: { status: 'awaiting_confirmation' | 'paid' | 'rejected'; adminNote?: string; clientConfirmedReceived?: boolean }): Promise<{ message: string; withdrawal: WithdrawalRequest }> {
    return this.request(`/api/admin/royalties/withdrawals/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }


  async exportAdminBackup(): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch('/api/admin/backup/export', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP error ${response.status}`);
    }
    return response.blob();
  }

  async importAdminBackup(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('backup', file);
    return this.request<any>('/api/admin/backup/import', {
      method: 'POST',
      body: formData,
    });
  }

  // Enquiries
  async submitEnquiry(payload: { name: string; email: string; phone?: string; subject: string; message: string }): Promise<{ message: string; enquiry: Enquiry }> {
    return this.request<{ message: string; enquiry: Enquiry }>('/api/enquiries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getAdminEnquiries(): Promise<{ enquiries: Enquiry[] }> {
    return this.request<{ enquiries: Enquiry[] }>('/api/admin/enquiries');
  }

  async updateEnquiryStatus(id: string, status: 'new' | 'read' | 'replied'): Promise<{ message: string; enquiry: Enquiry }> {
    return this.request<{ message: string; enquiry: Enquiry }>(`/api/admin/enquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Notifications
  async getNotifications(): Promise<{ notifications: NotificationLog[] }> {
    return this.request<{ notifications: NotificationLog[] }>('/api/notifications');
  }
}

export const api = new ApiService();
