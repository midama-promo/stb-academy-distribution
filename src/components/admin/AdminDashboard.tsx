import React, { useState, useEffect } from 'react';
import { VideoSubmissions } from '../common/VideoSubmissions';
import {
  Shield,
  Disc,
  Users,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  LogOut,
  UserPlus,
  Send,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Eye,
  Sliders,
  Mail,
  Bell,
  Download,
  XCircle,
  RotateCcw,
  FolderOpen,
  FileCheck,
  Archive,
  UploadCloud,
  Plus,
  Link2,
  Trash2,
  Wallet,
  Ban,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Release, User, Enquiry, OacRequest, AdminStats, ReleaseStatus, WithdrawalRequest } from '../../types';
import { api } from '../../services/api';
import { Logo } from '../common/Logo';

import { ClientEmailCampaignManager } from './ClientEmailCampaignManager';
import { RoyaltyWithdrawalModal } from '../client/RoyaltyWithdrawalModal';
import { SupportChat } from '../common/SupportChat';

interface AdminDashboardProps {
  onSelectRelease: (release: Release) => void;
  onOpenSharePage: (refNumber: string) => void;
  onOpenNotifications: () => void;
  onGoHome: () => void;
  onStatusUpdated?: (updated: Release) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onSelectRelease,
  onOpenSharePage,
  onOpenNotifications,
  onGoHome,
  onStatusUpdated,
}) => {
  const { user, logout, accessClientAccount, refreshUser } = useAuth();
  const isSuperAdmin = user?.isPlatformOwner === true;
  const [accessingClientId, setAccessingClientId] = useState<string | null>(null);
  const [siteLogoUrl, setSiteLogoUrl] = useState('');
  const [socialLinks, setSocialLinks] = useState<Array<{ platform: string; url: string }>>([]);
  const [siteSettingsBusy, setSiteSettingsBusy] = useState(false);
  const [siteLogoUploading, setSiteLogoUploading] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'releases' | 'clients' | 'campaigns' | 'enquiries' | 'oac' | 'messages' | 'royalties' | 'settings'>('releases');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [videoSubmissions, setVideoSubmissions] = useState<any[]>([]);
  const [clients, setClients] = useState<User[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [oacRequests, setOacRequests] = useState<OacRequest[]>([]);
  const [oacSavingId, setOacSavingId] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected client to view their specific releases
  const [selectedClientForView, setSelectedClientForView] = useState<User | null>(null);

  // Filter & Search states
  const [releaseSearch, setReleaseSearch] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Manual Client Registration modal
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regSurname, setRegSurname] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCountry, setRegCountry] = useState('South Africa');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);
  const [regSuccessResult, setRegSuccessResult] = useState<{ client: User } | null>(null);
  const [editingClient, setEditingClient] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editSurname, setEditSurname] = useState('');
  const [editArtistName, setEditArtistName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deactivationClient, setDeactivationClient] = useState<User | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [deactivationSaving, setDeactivationSaving] = useState(false);

  // Asset download state
  const [downloadingArtworkId, setDownloadingArtworkId] = useState<string | null>(null);
  const [preSaveRelease, setPreSaveRelease] = useState<Release | null>(null);
  const [preSaveLabel, setPreSaveLabel] = useState('Pre-save');
  const [preSaveUrl, setPreSaveUrl] = useState('');
  const [preSaveSaving, setPreSaveSaving] = useState(false);
  const [royaltyRelease, setRoyaltyRelease] = useState<Release | null>(null);
  const [royaltyAmountInput, setRoyaltyAmountInput] = useState('0');
  const [royaltySaving, setRoyaltySaving] = useState(false);
  const [royaltyWithdrawals, setRoyaltyWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [adminRoyaltySummary, setAdminRoyaltySummary] = useState({totalEarnings:0,pendingAmount:0,paidAmount:0,availableAmount:0});
  const [adminRoyaltyAdmins, setAdminRoyaltyAdmins] = useState<Array<{id:string;name:string;email:string;adminRoyaltyAllocation:number;payoutProfile?:any}>>([]);
  const [adminRoyaltyOverview, setAdminRoyaltyOverview] = useState({grossRoyalty:0,normalAdminShare:0,superAdminShare:0,eligibleReleases:0});
  const [adminPayoutProfiles,setAdminPayoutProfiles]=useState<Array<{userId:string;name:string;email:string;role:string;payoutProfile:any}>>([]);
  const [adminAllocationInputs, setAdminAllocationInputs] = useState<Record<string,string>>({});
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [withdrawalProcessingId, setWithdrawalProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const seenKey = `stbacademy-admin-tutorial:${user?.email || 'admin'}`;
    try { if (user?.email && !localStorage.getItem(seenKey)) setTutorialOpen(true); } catch { /* private browsing */ }
    api.getSiteSettings().then(result => { setSiteLogoUrl(result.settings.logoUrl || ''); setSocialLinks(result.settings.socialLinks || []); }).catch(() => {});
  }, [user?.email]);

  const saveSiteBranding = async () => {
    setSiteSettingsBusy(true);
    try {
      const result = await api.saveSiteSettings({ logoUrl: siteLogoUrl.trim(), socialLinks: socialLinks.filter(x => x.platform.trim() && x.url.trim()) });
      setSiteLogoUrl(result.settings.logoUrl || ''); setSocialLinks(result.settings.socialLinks || []);
      window.dispatchEvent(new CustomEvent('stbacademy:site-settings-updated', { detail: result.settings }));
      alert('Website logo and social links saved. They will appear across the public website.');
    } catch (err: any) { alert(err.message || 'Could not save website settings.'); }
    finally { setSiteSettingsBusy(false); }
  };

  const closeTutorial = () => {
    try { localStorage.setItem(`stbacademy-admin-tutorial:${user?.email || 'admin'}`, 'done'); } catch { /* private browsing */ }
    setTutorialOpen(false);
  };

  const handleReleaseStatusUpdated = (updated: Release) => {
    setReleases(prev => prev.map(r => r.id === updated.id ? updated : r));
    if (preSaveRelease?.id === updated.id) setPreSaveRelease(updated);
    if (onStatusUpdated) onStatusUpdated(updated);
  };

  const handleDeleteRelease = async (release: Release) => {
    const confirmed = window.confirm(`Permanently delete ${release.title} (${release.refNumber})? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await api.deleteRelease(release.id);
      setReleases(prev => prev.filter(item => item.id !== release.id));
      alert(`Release ${release.refNumber} was deleted.`);
    } catch (err: any) {
      alert(err.message || 'Could not delete this release submission.');
    }
  };

  const openPreSaveManager = (rel: Release) => {
    setPreSaveRelease(rel);
    setPreSaveLabel('Pre-save');
    setPreSaveUrl('');
  };

  const handleAddPreSaveLink = async () => {
    if (!preSaveRelease || !preSaveUrl.trim()) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(preSaveUrl.trim());
    } catch {
      alert('Please enter a valid pre-save URL.');
      return;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      alert('Pre-save URL must start with http:// or https://.');
      return;
    }

    try {
      setPreSaveSaving(true);
      const existingLinks = preSaveRelease.preSaveLinks || [];
      const result = await api.updatePreSaveLinks(preSaveRelease.id, [
        ...existingLinks,
        { label: preSaveLabel.trim() || 'Pre-save', url: preSaveUrl.trim() },
      ]);
      setReleases(prev => prev.map(r => r.id === result.release.id ? result.release : r));
      setPreSaveRelease(result.release);
      setPreSaveUrl('');
      setPreSaveLabel('Pre-save');
    } catch (err: any) {
      alert(err.message || 'Could not save the pre-save link.');
    } finally {
      setPreSaveSaving(false);
    }
  };

  const handleRemovePreSaveLink = async (linkId: string) => {
    if (!preSaveRelease) return;
    try {
      setPreSaveSaving(true);
      const nextLinks = (preSaveRelease.preSaveLinks || []).filter(link => link.id !== linkId);
      const result = await api.updatePreSaveLinks(preSaveRelease.id, nextLinks);
      setReleases(prev => prev.map(r => r.id === result.release.id ? result.release : r));
      setPreSaveRelease(result.release);
    } catch (err: any) {
      alert(err.message || 'Could not remove the pre-save link.');
    } finally {
      setPreSaveSaving(false);
    }
  };

  const openRoyaltyEditor = (rel: Release) => {
    setRoyaltyRelease(rel);
    setRoyaltyAmountInput(Number(rel.grossRoyaltyAmount ?? rel.royaltyAmount ?? 0).toFixed(2));
  };

  const saveRoyaltyAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!royaltyRelease) return;
    const amount = Number(royaltyAmountInput);
    if (!Number.isFinite(amount) || amount < 0) { alert('Enter a valid non-negative Rand amount.'); return; }
    try {
      setRoyaltySaving(true);
      const result = await api.updateReleaseRoyalty(royaltyRelease.id, amount);
      setReleases(prev => prev.map(r => r.id === result.release.id ? result.release : r));
      setRoyaltyRelease(null);
    } catch (err: any) {
      alert(err.message || 'Could not update the release royalty.');
    } finally {
      setRoyaltySaving(false);
    }
  };

  const processWithdrawal = async (withdrawal: WithdrawalRequest, status: 'paid' | 'rejected') => {
    if (!window.confirm(status === 'paid' ? `Confirm that R${withdrawal.amount.toFixed(2)} has been transferred to ${withdrawal.payoutIdentifier || 'the saved PayPal account'}?` : `Reject this R${withdrawal.amount.toFixed(2)} payment request?`)) return;
    try {
      setWithdrawalProcessingId(withdrawal.id);
      const result = await api.updateRoyaltyWithdrawal(withdrawal.id, { status, adminNote: status === 'paid' ? 'Manual PayPal transfer completed by STB Academy.' : 'Payment request rejected by STB Academy.' });
      setRoyaltyWithdrawals(prev => prev.map(w => w.id === result.withdrawal.id ? result.withdrawal : w));
      if (!isSuperAdmin) { const r=await api.getAdminRoyaltySummary(); setAdminRoyaltySummary({totalEarnings:r.totalEarnings,pendingAmount:r.pendingAmount,paidAmount:r.paidAmount,availableAmount:r.availableAmount}); }
    } catch (err: any) { alert(err.message || 'Could not update the payment request.'); }
    finally { setWithdrawalProcessingId(null); }
  };

  const handleDownloadArtwork = async (rel: Release) => {
    try {
      setDownloadingArtworkId(rel.id);
      await api.downloadAsset(rel.id, 'artwork', undefined, rel.artworkFilename);
    } catch (err: any) {
      alert(err.message || 'Failed to download artwork.');
    } finally {
      setDownloadingArtworkId(null);
    }
  };

  const handleExportBackup = async () => {
    try {
      setBackupBusy(true);
      const blob = await api.exportAdminBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stbacademy-mg-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Backup export failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    if (!window.confirm('Import this backup additively? Existing records and files will never be overwritten or deleted.')) return;
    try {
      setBackupBusy(true);
      const result = await api.importAdminBackup(file);
      alert(`Backup restored safely. Added ${result.usersAdded} users, ${result.releasesAdded} releases, ${result.catalogueAdded} legacy records and ${result.assetsRestored} files. Existing data was preserved.`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Backup import failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Load each section independently: a slow endpoint should not keep the entire
      // admin portal empty while all other requests have already completed.
      const tasks = [
        api.getAdminStats().then(r => setStats(r.stats)),
        api.getReleases().then(r => setReleases(r.releases)),
        api.getAdminClients().then(r => setClients(r.clients)),
        api.getAdminEnquiries().then(r => setEnquiries(r.enquiries)),
        ...(isSuperAdmin ? [api.getAdminOacRequests().then(r => setOacRequests(r.requests || []))] : []),
        (isSuperAdmin ? api.getAdminRoyaltyWithdrawals().then(r => setRoyaltyWithdrawals(r.withdrawals || [])) : api.getAdminRoyaltySummary().then(r => { setAdminRoyaltySummary({totalEarnings:r.totalEarnings,pendingAmount:r.pendingAmount,paidAmount:r.paidAmount,availableAmount:r.availableAmount}); setRoyaltyWithdrawals(r.withdrawals || []); })),
        ...(isSuperAdmin ? [api.getAdminRoyaltyAdmins().then(r => { setAdminRoyaltyAdmins(r.admins); setAdminAllocationInputs(Object.fromEntries(r.admins.map(a=>[a.id,String(a.adminRoyaltyAllocation||0)]))); }), api.getAdminRoyaltyOverview().then(r => setAdminRoyaltyOverview(r)), api.getAdminPayoutProfiles().then(r=>setAdminPayoutProfiles(r.profiles||[]))] : []),
        api.getVideoSubmissions().then(r => setVideoSubmissions(r.submissions || [])),
      ];
      const results = await Promise.allSettled(tasks);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed && results.every(r => r.status === 'rejected')) {
        throw failed.reason;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load administrative data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleStatusUpdated = (e: Event) => {
      const updated = (e as CustomEvent<Release>).detail;
      if (updated?.id) setReleases(prev => prev.map(r => r.id === updated.id ? updated : r));
    };
    window.addEventListener('stbacademy:release-status-updated', handleStatusUpdated);
    return () => window.removeEventListener('stbacademy:release-status-updated', handleStatusUpdated);
  }, []);


  // Keep the super-admin OAC inbox current while it is open.
  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'oac') return;
    let cancelled = false;
    const refreshOacRequests = async () => {
      try {
        const result = await api.getAdminOacRequests();
        if (!cancelled) setOacRequests(result.requests || []);
      } catch (err) {
        console.error('[ADMIN] Could not refresh OAC requests:', err);
      }
    };
    void refreshOacRequests();
    const interval = window.setInterval(refreshOacRequests, 20000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isSuperAdmin, activeTab]);

  const saveOacRequest = async (request: OacRequest, status: OacRequest['status']) => {
    try {
      setOacSavingId(request.id);
      const result = await api.updateOacRequest(request.id, { status, adminNote: request.adminNote || '' });
      setOacRequests(prev => prev.map(item => item.id === result.request.id ? result.request : item));
    } catch (err: any) {
      alert(err?.message || 'Could not update the Official Artist Channel request.');
    } finally { setOacSavingId(null); }
  };

  const handleToggleClientStatus = async (client: User) => {
    if (client.status === 'disabled') {
      try {
        const res = await api.updateClient(client.id, { status: 'active' });
        setClients(prev => prev.map(c => c.id === client.id ? res.client : c));
      } catch (err: any) {
        alert(err.message || 'Failed to reactivate client status.');
      }
      return;
    }
    setDeactivationClient(client);
    setDeactivationReason('');
  };

  const handleConfirmDeactivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivationClient || !deactivationReason.trim()) {
      alert('Please provide a reason for the ban / termination.');
      return;
    }
    try {
      setDeactivationSaving(true);
      const res = await api.updateClient(deactivationClient.id, { status: 'disabled', disabledReason: deactivationReason.trim() });
      setClients(prev => prev.map(c => c.id === deactivationClient.id ? res.client : c));
      setDeactivationClient(null);
      setDeactivationReason('');
    } catch (err: any) {
      alert(err.message || 'Failed to ban / terminate client account.');
    } finally {
      setDeactivationSaving(false);
    }
  };

  const handleAccessClientAccount = async (client: User) => {
    try {
      setAccessingClientId(client.id);
      await accessClientAccount(client.id);
    } catch (err: any) {
      alert(err.message || 'Could not access client account.');
    } finally {
      setAccessingClientId(null);
    }
  };

  const handleManualRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regName.trim()) return;

    try {
      setRegSubmitting(true);
      const res = await api.registerClient({
        email: regEmail.trim(),
        name: regName.trim(),
        realFirstName: regFirstName.trim() || undefined,
        realSurname: regSurname.trim() || undefined,
        phone: regPhone.trim() || undefined,
        country: regCountry.trim() || 'South Africa',
      });

      setRegSuccessResult({
        client: res.client,
      });

      setClients([res.client, ...clients]);
      setRegName('');
      setRegFirstName('');
      setRegSurname('');
      setRegEmail('');
      setRegPhone('');
    } catch (err: any) {
      alert(err.message || 'Failed to register client.');
    } finally {
      setRegSubmitting(false);
    }
  };

  const openEditClient = (client: User) => {
    setEditingClient(client);
    setEditFirstName(client.realFirstName || '');
    setEditSurname(client.realSurname || '');
    setEditArtistName(client.artistName || client.name || '');
  };

  const saveClientDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    if (!editFirstName.trim() || !editSurname.trim() || !editArtistName.trim()) {
      alert('First name, surname, and artist name is required.');
      return;
    }
    try {
      setEditSaving(true);
      const res = await api.updateClient(editingClient.id, {
        realFirstName: editFirstName.trim(),
        realSurname: editSurname.trim(),
        artistName: editArtistName.trim(),
        name: editArtistName.trim(),
      });
      setClients(prev => prev.map(c => c.id === res.client.id ? { ...c, ...res.client } : c));
      if (selectedClientForView?.id === res.client.id) setSelectedClientForView(prev => prev ? { ...prev, ...res.client } : prev);
      setEditingClient(null);
    } catch (err: any) {
      alert(err.message || 'Could not update client details.');
    } finally {
      setEditSaving(false);
    }
  };

  const getStatusBadge = (status: ReleaseStatus) => {
    switch (status) {
      case 'Pending Review':
        return 'text-amber-400 bg-amber-950/40 border-amber-800/80';
      case 'Approved':
      case 'Review Passed':
        return 'text-orange-400 bg-orange-950/40 border-orange-800/80';
      case 'Delivered':
        return 'text-cyan-300 bg-cyan-950/40 border-cyan-800/80';
      case 'Completed':
        return 'text-blue-300 bg-blue-950/40 border-blue-800/80';
      case 'Denied':
        return 'text-orange-400 bg-orange-950/40 border-orange-800/80';
      case 'Corrections Required':
        return 'text-orange-400 bg-orange-950/40 border-orange-800/80';
      case 'Takedown Requested':
        return 'text-amber-300 bg-amber-950/40 border-amber-700/80';
      case 'Takedown Processing':
        return 'text-orange-300 bg-orange-950/40 border-orange-700/80';
      case 'Takedown Completed':
        return 'text-blue-300 bg-blue-950/40 border-blue-700/80';
      default:
        return 'text-neutral-300 bg-neutral-900 border-neutral-800';
    }
  };

  const filteredReleases = releases.filter((r) => {
    if (!isSuperAdmin && ['Takedown Requested', 'Takedown Processing'].includes(r.status)) return false;
    if (selectedClientForView && r.userId !== selectedClientForView.id) {
      return false;
    }

    const matchesSearch =
      r.title.toLowerCase().includes(releaseSearch.toLowerCase()) ||
      r.refNumber.toLowerCase().includes(releaseSearch.toLowerCase()) ||
      r.artistLabelName.toLowerCase().includes(releaseSearch.toLowerCase()) ||
      r.primaryArtists.some(a => a.toLowerCase().includes(releaseSearch.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className={`admin-dashboard min-h-screen text-neutral-100 pb-20 ${isSuperAdmin ? 'admin-theme-super' : 'admin-theme-standard'}`}>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Top Admin Header Bar */}
      <header className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <Logo size="md" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold ${isSuperAdmin ? 'admin-role-super' : 'admin-role-standard'}`}>
              <Shield className="w-3.5 h-3.5" />
              <span>{isSuperAdmin ? 'SUPER ADMIN' : 'ADMINISTRATOR DESK'}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="search"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !globalSearch.trim()) return;
                  const q = globalSearch.trim().toLowerCase();
                  if (clients.some(c => [c.name, c.email, c.artistName].some(v => String(v || '').toLowerCase().includes(q)))) setActiveTab('clients');
                  else if (enquiries.some(c => JSON.stringify(c).toLowerCase().includes(q))) setActiveTab('enquiries');
                  else { setActiveTab('releases'); setReleaseSearch(globalSearch.trim()); }
                }}
                placeholder="Search all admin data… (Enter)"
                aria-label="Search across admin portal"
                className="w-52 lg:w-64 bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-orange-600"
              />
            </div>
            <button type="button" onClick={() => setTutorialOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl" title="Open admin portal tutorial">Get Started</button>

            <button
              onClick={onGoHome}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              title="View Public Homepage"
            >
              <Eye className="w-3.5 h-3.5 text-neutral-400" />
              <span className="hidden md:inline">View Public Site</span>
            </button>

            <button
              onClick={onOpenNotifications}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-xl transition-colors relative cursor-pointer"
              title="Audit & Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setIsRegisterModalOpen(true);
                setRegSuccessResult(null);
              }}
              className="admin-primary-action flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Register New Client</span>
              <span className="sm:hidden">New Client</span>
            </button>

            <button
              onClick={logout}
              className="p-2 text-neutral-400 hover:text-orange-400 hover:bg-neutral-900 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        
        {/* Real Metrics Row as required by Requirement 6 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl space-y-1">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block truncate">Total Clients</span>
            <span className="text-2xl font-bold text-white font-['Space_Grotesk']">{clients.length}</span>
          </div>

          <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl space-y-1">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block truncate">Active Clients</span>
            <span className="text-2xl font-bold text-orange-400 font-['Space_Grotesk']">
              {clients.filter(c => c.status === 'active').length}
            </span>
          </div>

          <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl space-y-1">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block truncate">Total Submissions</span>
            <span className="text-2xl font-bold text-white font-['Space_Grotesk']">{releases.length}</span>
          </div>

          <div className="p-4 bg-amber-950/20 border border-amber-900/50 rounded-xl space-y-1">
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block truncate">Under Review</span>
            <span className="text-2xl font-bold text-amber-400 font-['Space_Grotesk']">
              {releases.filter(r => r.status === 'Pending Review').length}
            </span>
          </div>

          <div className="p-4 bg-orange-950/20 border border-orange-900/50 rounded-xl space-y-1">
            <span className="text-[10px] font-mono text-orange-400 uppercase tracking-wider block truncate">Corrections Required</span>
            <span className="text-2xl font-bold text-orange-400 font-['Space_Grotesk']">
              {releases.filter(r => r.status === 'Corrections Required').length}
            </span>
          </div>

          <div className="p-4 bg-orange-950/20 border border-orange-900/50 rounded-xl space-y-1">
            <span className="text-[10px] font-mono text-orange-400 uppercase tracking-wider block truncate">Approved</span>
            <span className="text-2xl font-bold text-orange-400 font-['Space_Grotesk']">
              {releases.filter(r => r.status === 'Approved').length}
            </span>
          </div>

          <div className="p-4 bg-blue-950/20 border border-blue-900/50 rounded-xl space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider block truncate">Completed</span>
            <span className="text-2xl font-bold text-blue-400 font-['Space_Grotesk']">
              {releases.filter(r => ['Delivered','In Distribution','Completed'].includes(r.status)).length}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 gap-6 text-sm font-semibold overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => {
              setActiveTab('releases');
              setSelectedClientForView(null);
            }}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'releases' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Disc className="w-4 h-4 text-orange-500" />
            <span>Releases Management ({releases.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('clients')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'clients' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 text-orange-500" />
            <span>Clients & Artists ({clients.length})</span>
          </button>

          <button
            style={{ display: isSuperAdmin ? undefined : 'none' }} onClick={() => setActiveTab('campaigns')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'campaigns' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Mail className="w-4 h-4 text-orange-500" />
            <span>Client Email Campaigns</span>
          </button>

          <button
            onClick={() => setActiveTab('enquiries')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'enquiries' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-orange-500" />
            <span>Enquiries Desk ({enquiries.length})</span>
          </button>

          {isSuperAdmin && <button
            onClick={() => setActiveTab('oac')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'oac' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'}`}
          >
            <Link2 className="w-4 h-4 text-orange-500" />
            <span>OAC Requests ({oacRequests.filter(request => request.status === 'Pending Review' || request.status === 'Under Review').length})</span>
          </button>}

          <button
            onClick={() => setActiveTab('messages')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'messages' ? 'border-current text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Client Support Inbox</span>
          </button>

          <button
            onClick={() => setActiveTab('royalties')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'royalties' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Wallet className="w-4 h-4 text-orange-500" />
            <span>My Royalties & Payments ({royaltyWithdrawals.filter(w => w.status === 'pending').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'settings' ? 'border-orange-600 text-white font-bold' : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Archive className="w-4 h-4 text-orange-500" />
            <span>Settings</span>
          </button>
        </div>

        {/* TAB: CATALOGUE */}
        {isSuperAdmin && activeTab === 'campaigns' && <ClientEmailCampaignManager />}


        {isSuperAdmin && activeTab === 'oac' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-white">YouTube Official Artist Channel Requests</h2>
              <p className="mt-1 text-xs text-neutral-400">Requests submitted by clients from their dashboards. New requests refresh automatically while this inbox is open.</p>
            </div>
            {oacRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center text-xs text-neutral-500">No Official Artist Channel requests have been submitted yet.</div>
            ) : oacRequests.map(request => (
              <article key={request.id} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-white">{request.artistName}</h3><span className={`rounded-full border px-2 py-1 text-[10px] ${request.status==='Approved'?'border-emerald-800 bg-emerald-950/40 text-emerald-300':request.status==='Rejected'?'border-red-800 bg-red-950/40 text-red-300':'border-amber-800 bg-amber-950/40 text-amber-300'}`}>{request.status}</span></div><p className="mt-1 text-xs text-neutral-400">{request.clientName} · {request.email}</p></div>
                  <span className="text-[10px] text-neutral-500">Submitted {new Date(request.createdAt).toLocaleString()}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Original YouTube channel</p><a href={request.originalYoutubeChannel} target="_blank" rel="noreferrer" className="break-all text-xs text-orange-300 hover:underline">{request.originalYoutubeChannel}</a></div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Topic channel links</p><div className="space-y-1">{request.topicChannelLinks.map((link,index)=><a key={`${request.id}-${index}`} href={link} target="_blank" rel="noreferrer" className="block break-all text-xs text-orange-300 hover:underline">Topic {index+1}: {link}</a>)}</div></div>
                </div>
                <label className="block text-xs text-neutral-300">Administrator notes<textarea value={request.adminNote || ''} onChange={e=>setOacRequests(prev=>prev.map(item=>item.id===request.id?{...item,adminNote:e.target.value}:item))} rows={2} maxLength={1500} placeholder="Internal review notes or follow-up details…" className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"/></label>
                <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-neutral-400">Status</label><select value={request.status} onChange={e=>setOacRequests(prev=>prev.map(item=>item.id===request.id?{...item,status:e.target.value as OacRequest['status']}:item))} className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white"><option>Pending Review</option><option>Under Review</option><option>Approved</option><option>Rejected</option></select><button type="button" disabled={oacSavingId===request.id} onClick={()=>saveOacRequest(request,request.status)} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-50">{oacSavingId===request.id?'Saving…':'Save review'}</button></div>
              </article>
            ))}
          </div>
        )}

        {activeTab === 'royalties' && (
          <div className="space-y-6">
            {!isSuperAdmin && <section className="rounded-2xl border border-orange-800/50 bg-orange-950/20 p-5"><p className="text-xs uppercase tracking-wider text-orange-300">Your assigned royalty allocation</p><div className="mt-2 text-3xl font-black text-white">R{adminRoyaltySummary.totalEarnings.toFixed(2)}</div><p className="mt-1 text-xs text-neutral-400">PayPal: {user?.payoutProfile?'Linked':'Not linked'} · Available R{adminRoyaltySummary.availableAmount.toFixed(2)} · Pending R{adminRoyaltySummary.pendingAmount.toFixed(2)} · Paid R{adminRoyaltySummary.paidAmount.toFixed(2)}</p><button type="button" onClick={()=>setPayoutModalOpen(true)} disabled={false} className="mt-4 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">Link PayPal / Request payment</button></section>}
            {isSuperAdmin && <><section className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"><span className="text-[10px] uppercase text-neutral-500">Gross royalties</span><strong className="mt-1 block text-xl text-white">R{adminRoyaltyOverview.grossRoyalty.toFixed(2)}</strong></div><div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"><span className="text-[10px] uppercase text-neutral-500">Normal admin 10%</span><strong className="mt-1 block text-xl text-orange-300">R{adminRoyaltyOverview.normalAdminShare.toFixed(2)}</strong></div><div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"><span className="text-[10px] uppercase text-neutral-500">Super admin 10%</span><strong className="mt-1 block text-xl text-orange-300">R{adminRoyaltyOverview.superAdminShare.toFixed(2)}</strong></div><div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"><span className="text-[10px] uppercase text-neutral-500">Eligible releases</span><strong className="mt-1 block text-xl text-white">{adminRoyaltyOverview.eligibleReleases}</strong></div></section><section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5"><h3 className="font-bold text-white">Normal administrator allocations</h3><p className="mt-1 text-xs text-neutral-400">Assign or edit the payment balance available to each normal administrator.</p><div className="mt-4 space-y-3">{adminRoyaltyAdmins.map(a=><div key={a.id} className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-[1fr_180px_auto]"><div><strong className="text-sm text-white">{a.name}</strong><p className="text-[11px] text-neutral-500">{a.email}</p><p className="mt-1 text-[10px] text-neutral-400">PayPal: {a.payoutProfile ? [a.payoutProfile.email,a.payoutProfile.mobile,a.payoutProfile.username,a.payoutProfile.paypalMeUrl].filter(Boolean).join(' · ') : 'Not linked'}</p></div><input type="number" min="0" step="0.01" value={adminAllocationInputs[a.id]??String(a.adminRoyaltyAllocation)} onChange={e=>setAdminAllocationInputs(v=>({...v,[a.id]:e.target.value}))} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"/><button type="button" onClick={async()=>{try{const r=await api.updateAdminRoyaltyAllocation(a.id,Number(adminAllocationInputs[a.id]));setAdminRoyaltyAdmins(prev=>prev.map(x=>x.id===a.id?{...x,adminRoyaltyAllocation:Number(r.user.adminRoyaltyAllocation||0)}:x));alert('Administrator royalty allocation updated.');}catch(e:any){alert(e.message||'Could not update allocation.');}}} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white">Save allocation</button></div>)}</div></section><section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5"><h3 className="font-bold text-white">Linked PayPal accounts</h3><p className="mt-1 text-xs text-neutral-400">Payout identifiers saved by clients and operations administrators.</p>{adminPayoutProfiles.length===0?<p className="mt-4 text-xs text-neutral-500">No linked PayPal accounts yet.</p>:<div className="mt-4 space-y-2">{adminPayoutProfiles.map(profile=><div key={profile.userId} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-white">{profile.name}</strong><span className="text-[9px] uppercase text-orange-300">{profile.role==='admin'?'Operations':'Artist'}</span></div><p className="text-[10px] text-neutral-500">{profile.email}</p><p className="mt-1 break-words text-[11px] text-orange-100">{[profile.payoutProfile?.email,profile.payoutProfile?.mobile,profile.payoutProfile?.username,profile.payoutProfile?.paypalMeUrl].filter(Boolean).join(' · ')}</p></div>)}</div>}</section></>}

            <div>
              <h3 className="text-base font-bold text-white font-['Space_Grotesk'] flex items-center gap-2"><Wallet className="w-4 h-4 text-orange-400" /> Royalties & Withdrawal Requests</h3>
              <p className="text-xs text-neutral-400 mt-1">Review PayPal payment requests and monitor release-level royalty allocations. Financial allocations are managed separately from release reviews.</p>
            </div>

            {isSuperAdmin ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl"><span className="text-[10px] uppercase text-neutral-500 block">Artist royalties assigned</span><strong className="text-xl text-orange-300">R{(releases.filter(r => ['Delivered','In Distribution','Completed'].includes(r.status)).reduce((sum, r) => sum + Number(r.royaltyAmount || 0), 0) + videoSubmissions.filter(v => ['Delivered','In Distribution'].includes(v.status)).reduce((sum, v) => sum + Number(v.royaltyAmount || 0), 0)).toFixed(2)}</strong></div><div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl"><span className="text-[10px] uppercase text-neutral-500 block">Pending Payments</span><strong className="text-xl text-amber-400">R{royaltyWithdrawals.filter(w => w.status === 'pending').reduce((sum, w) => sum + w.amount, 0).toFixed(2)}</strong></div><div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl"><span className="text-[10px] uppercase text-neutral-500 block">Paid Payments</span><strong className="text-xl text-blue-400">R{royaltyWithdrawals.filter(w => w.status === 'paid').reduce((sum, w) => sum + w.amount, 0).toFixed(2)}</strong></div></div> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl"><span className="text-[10px] uppercase text-neutral-500 block">My assigned allocation</span><strong className="text-xl text-orange-300">R{adminRoyaltySummary.totalEarnings.toFixed(2)}</strong></div><div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl"><span className="text-[10px] uppercase text-neutral-500 block">Available</span><strong className="text-xl text-orange-400">R{adminRoyaltySummary.availableAmount.toFixed(2)}</strong></div><div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl"><span className="text-[10px] uppercase text-neutral-500 block">Paid</span><strong className="text-xl text-blue-400">R{adminRoyaltySummary.paidAmount.toFixed(2)}</strong></div></div>}

            {royaltyWithdrawals.length === 0 ? (
              <div className="p-12 text-center bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl text-xs text-neutral-500">No withdrawal requests have been submitted yet.</div>
            ) : (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 font-mono uppercase text-[10px]"><tr><th className="p-3">Client</th><th className="p-3">Amount</th><th className="p-3">PayPal Details</th><th className="p-3">Requested</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {royaltyWithdrawals.map(w => (
                        <tr key={w.id} className="hover:bg-neutral-800/30 align-top">
                          <td className="p-3"><strong className="text-white">{w.clientName}</strong><span className="block text-[10px] text-neutral-500 font-mono">{w.userEmail}</span></td>
                          <td className="p-3"><strong className="text-orange-400">R{w.amount.toFixed(2)}</strong></td>
                          <td className="p-3 min-w-[260px] text-[11px] text-neutral-300 leading-relaxed"><div><b>PayPal identifier(s):</b></div><div className="mt-1 break-words text-orange-200">{w.payoutIdentifier || 'No payout identifier recorded'}</div><div className="mt-1 text-neutral-500">Account holder: {w.clientName}</div></td>
                          <td className="p-3 text-[10px] text-neutral-400 whitespace-nowrap">{new Date(w.createdAt).toLocaleString()}</td>
                          <td className="p-3"><span className={`text-[10px] font-bold px-2 py-1 rounded border inline-block ${w.status === 'paid' ? 'text-orange-400 bg-orange-950/40 border-orange-800' : w.status === 'pending' ? 'text-amber-400 bg-amber-950/40 border-amber-800' : 'text-orange-400 bg-orange-950/40 border-orange-800'}`}>{w.status === 'paid' ? 'Paid' : w.status === 'pending' ? 'Pending' : 'Rejected'}</span></td>
                          <td className="p-3 text-right whitespace-nowrap">{isSuperAdmin && w.status === 'pending' ? <div className="flex justify-end gap-2"><button type="button" disabled={withdrawalProcessingId === w.id} onClick={() => processWithdrawal(w, 'paid')} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-lg text-[10px] font-bold">{withdrawalProcessingId === w.id ? 'Saving...' : 'Paid'}</button><button type="button" disabled={withdrawalProcessingId === w.id} onClick={() => processWithdrawal(w, 'rejected')} className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded-lg text-[10px] font-bold">Reject</button></div> : <span className="text-[10px] text-neutral-600">{w.status === 'paid' ? 'Paid' : w.status === 'rejected' ? 'Rejected' : 'Awaiting owner processing'}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: DATA BACKUP */}
        {activeTab === 'messages' && <div className="space-y-4"><div><h2 className="text-xl font-bold text-white">Client Support Inbox</h2><p className="mt-1 text-xs text-neutral-400">Read client conversations and reply directly from this administrator dashboard.</p></div><SupportChat admin /></div>}

        {activeTab === 'settings' && (
          <div className="max-w-3xl space-y-6">
            <section className="p-6 bg-neutral-900/60 border border-neutral-800 rounded-2xl space-y-4">
              <div><h3 className="text-base font-bold text-white">Website Branding & Social Links</h3><p className="text-xs text-neutral-400 mt-1">Change the logo used across the website and manage the social buttons shown at the bottom of public pages.</p></div>
              <label className="block text-xs text-neutral-300">Upload a new logo (JPG or PNG)<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" disabled={siteLogoUploading} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setSiteLogoUploading(true); try { const result = await api.uploadSiteLogo(file); setSiteLogoUrl(result.logoUrl); window.dispatchEvent(new CustomEvent('stbacademy:site-settings-updated', { detail: { logoUrl: result.logoUrl, socialLinks } })); alert(result.message); } catch (err: any) { alert(err.message || 'Logo upload failed.'); } finally { setSiteLogoUploading(false); e.currentTarget.value = ''; } }} className="mt-1 block w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs text-white file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-white" />{siteLogoUploading && <span className="mt-1 block text-[10px] text-orange-300">Uploading logo…</span>}</label>
              <label className="block text-xs text-neutral-300">Or use a publicly accessible logo URL (HTTPS)<input value={siteLogoUrl} onChange={e => setSiteLogoUrl(e.target.value)} placeholder="https://.../stbacademy-logo.png" className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white" /></label>
              <div className="space-y-2"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">Social media buttons</h4><button type="button" onClick={() => setSocialLinks(v => [...v, { platform: '', url: '' }])} className="rounded-lg bg-neutral-800 px-3 py-2 text-xs text-white">Add link</button></div>
                {socialLinks.map((link, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-[.7fr_1.3fr_auto] gap-2"><input value={link.platform} onChange={e => setSocialLinks(v => v.map((x,i) => i === index ? { ...x, platform: e.target.value } : x))} placeholder="Instagram / TikTok / YouTube" className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white"/><input value={link.url} onChange={e => setSocialLinks(v => v.map((x,i) => i === index ? { ...x, url: e.target.value } : x))} placeholder="https://..." className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white"/><button type="button" onClick={() => setSocialLinks(v => v.filter((_,i) => i !== index))} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300">Remove</button></div>)}
                {!socialLinks.length && <p className="text-xs text-neutral-500">No social links configured yet.</p>}
              </div>
              <button type="button" onClick={() => void saveSiteBranding()} disabled={siteSettingsBusy} className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{siteSettingsBusy ? 'Saving…' : 'Save website branding'}</button>
            </section>
            {isSuperAdmin && <><div><h3 className="text-base font-bold text-white font-['Space_Grotesk']">Data Backup</h3><p className="text-xs text-neutral-400">Recommended before publishing code changes. This is your emergency copy if a deployment damages release data or uploaded files.</p></div>
            <div className="p-6 bg-neutral-900/60 border border-orange-900/50 rounded-2xl space-y-4">
              <div className="flex gap-3"><Shield className="w-5 h-5 text-orange-400 shrink-0" /><div><h4 className="text-sm font-bold text-white">Safe backup and restore</h4><p className="text-xs text-neutral-400 mt-1">Exports the database records plus uploaded artwork, masters and documents. Import is additive: existing IDs and files are never overwritten or deleted.</p></div></div>
              <div className="flex flex-wrap gap-3">
                <button onClick={handleExportBackup} disabled={backupBusy} className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-2"><Download className="w-4 h-4" /> Export Existing Data</button>
                <label className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"><UploadCloud className="w-4 h-4" /> Import Existing Data<input type="file" accept=".tar.gz,.tgz,application/gzip,application/x-gzip" className="hidden" disabled={backupBusy} onChange={e => { const file = e.target.files?.[0]; if (file) handleImportBackup(file); e.currentTarget.value = ''; }} /></label>
              </div>
              <div className="text-[11px] text-neutral-500 border-t border-neutral-800 pt-3">How to use: click Export Existing Data and save the downloaded file somewhere safe (for example, your computer and a cloud drive). Only use Import Existing Data to restore a backup when needed. Keep at least one backup outside the website.</div>
            </div></>}
          </div>
        )}

        {/* TAB 1: RELEASES MANAGEMENT */}
        {activeTab === 'releases' && (
          <div className="space-y-6">
            <VideoSubmissions admin superAdmin={isSuperAdmin} onUpdated={submission => setVideoSubmissions(prev => prev.map(item => item.id === submission.id ? submission : item))} />
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Filter by ref, title, artist, client..."
                  value={releaseSearch}
                  onChange={(e) => setReleaseSearch(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-600"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs text-neutral-400 font-mono flex items-center gap-1 shrink-0">
                  <Filter className="w-3.5 h-3.5" /> Status:
                </span>
                {['All', 'Pending Review', 'Approved', 'Delivered', 'In Distribution', 'Rejected', 'Corrections Required', 'Takedown Requested', 'Takedown Processing', 'Takedown Completed', 'Denied'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      statusFilter === st
                        ? 'bg-orange-600 text-white font-bold'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {selectedClientForView && (
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-between text-xs">
                <span>Showing releases submitted by: <strong className="text-white">{selectedClientForView.name}</strong> ({selectedClientForView.email}) · <strong className={selectedClientForView.contractAcceptedAt ? 'text-orange-400' : 'text-amber-400'}>{selectedClientForView.contractAcceptedAt ? 'Agreement signed' : 'Agreement not signed'}</strong>{selectedClientForView.contractAcceptedAt && <button className="ml-3 text-orange-300 underline" onClick={() => { const blob = new Blob([selectedClientForView.contractText || 'Signed STB Academy agreement record unavailable.'], {type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `STB Academy-Agreement-${selectedClientForView.name.replace(/[^a-z0-9]+/gi,'-')}.txt`; a.click(); URL.revokeObjectURL(url); }}>Download signed agreement</button>}</span>
                <button
                  onClick={() => setSelectedClientForView(null)}
                  className="text-orange-400 hover:underline"
                >
                  Show all releases
                </button>
              </div>
            )}

            {/* Releases Table / Empty State */}
            {releases.length === 0 ? (
              <div className="py-20 bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl text-center space-y-3 p-8">
                <Disc className="w-12 h-12 text-neutral-700 mx-auto" />
                <h3 className="text-base font-bold text-white font-['Space_Grotesk']">
                  No Releases Submitted Yet
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  When registered clients submit releases through their portal accounts, they will appear here with lossless masters, cover artwork, and review controls.
                </p>
              </div>
            ) : filteredReleases.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500">
                No releases match your current search or filter criteria.
              </div>
            ) : (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Release & Artwork</th>
                        <th className="py-3 px-4">Client / Artist</th>
                        <th className="py-3 px-4">Genre & Type</th>
                        <th className="py-3 px-4">Submission Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Royalty</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {filteredReleases.map((rel) => (
                        <tr
                          key={rel.id}
                          className="hover:bg-neutral-800/40 transition-colors group cursor-pointer"
                          onClick={() => onSelectRelease(rel)}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={rel.artworkUrl}
                                alt={rel.title}
                                className="w-11 h-11 rounded-lg object-cover border border-neutral-700 shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="font-mono text-[10px] text-orange-400 font-bold block">
                                  {rel.refNumber}
                                </span>
                                <span className="font-bold text-white text-xs block truncate group-hover:text-orange-400 transition-colors">
                                  {rel.title}
                                </span>
                                <span className="text-[11px] text-neutral-400 truncate block">
                                  {rel.primaryArtists.join(', ')}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-neutral-200 block truncate max-w-[160px]">
                              {rel.artistLabelName}
                            </span>
                            <span className="text-[10px] text-neutral-500 font-mono block truncate">
                              {rel.userEmail}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="text-neutral-300 block">{rel.genre}</span>
                            <span className="text-[10px] text-neutral-500 font-mono block">
                              {rel.releaseType} · {rel.tracks.length} MP3 reference track(s){rel.audioMasterPending ? ' · MP3 master conversion pending from support' : ''}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-neutral-300">
                            {new Date(rel.submittedAt).toLocaleDateString()}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-block ${getStatusBadge(rel.status)}`}>
                              {rel.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col gap-1.5">
                              <span className="font-bold text-orange-400">R{Number(rel.royaltyAmount || 0).toFixed(2)}</span>
                              {isSuperAdmin && <button type="button" onClick={() => openRoyaltyEditor(rel)} className="w-fit px-2.5 py-1 bg-orange-950/40 hover:bg-orange-900/60 border border-orange-800 text-orange-300 rounded-lg text-[10px] font-bold">Edit Royalty</button>}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {/* Direct Download Artwork */}
                              <button
                                type="button"
                                onClick={() => handleDownloadArtwork(rel)}
                                disabled={downloadingArtworkId === rel.id}
                                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Download Artwork"
                              >
                                {downloadingArtworkId === rel.id ? (
                                  <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {isSuperAdmin && (rel.status === 'Delivered' || rel.status === 'In Distribution') && (
                                <button
                                  type="button"
                                  onClick={() => openPreSaveManager(rel)}
                                  className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-1.5"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  {rel.preSaveLinks?.length ? `Pre-save (${rel.preSaveLinks.length})` : 'Add Pre-save'}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onSelectRelease(rel)}
                                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                              >
                                Review & Decide
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteRelease(rel)}
                                className="px-3 py-1 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 rounded-lg text-xs font-semibold transition-colors"
                                title="Permanently delete submission"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 2: REAL CLIENTS MANAGEMENT */}
        {activeTab === 'clients' && (
          <div className="space-y-6">
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white font-['Space_Grotesk']">
                  Registered Artist Accounts
                </h3>
                <p className="text-xs text-neutral-400">
                  Register artists, review signed agreements, manage accounts and monitor release activity.
                </p>
              </div>

              {isSuperAdmin && <button
                onClick={() => {
                  setIsRegisterModalOpen(true);
                  setRegSuccessResult(null);
                }}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow"
              >
                <UserPlus className="w-4 h-4" />
                <span>Register New Client</span>
              </button>}
            </div>



            {clients.length === 0 ? (
              <div className="py-20 bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl text-center space-y-3 p-8">
                <Users className="w-12 h-12 text-neutral-700 mx-auto" />
                <h3 className="text-base font-bold text-white font-['Space_Grotesk']">
                  No Clients Registered Yet
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Click "Register New Client" above to register an independent artist and provide their login details.
                </p>
              </div>
            ) : (
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Client Name & Surname</th>
                        <th className="py-3 px-4">Artist Name</th>
                        <th className="py-3 px-4">Email Address</th>
                        <th className="py-3 px-4">Account Status</th>
                        <th className="py-3 px-4">Artist Agreement</th>
                        <th className="py-3 px-4">Submitted Releases</th>
                        <th className="py-3 px-4">Registration Date</th>
                        <th className="py-3 px-4 text-right">Account Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {clients.map((c) => (
                        <tr key={c.id} className="hover:bg-neutral-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-white">
                            {c.realFirstName || c.realSurname ? `${c.realFirstName || ''} ${c.realSurname || ''}`.trim() : 'Name not assigned'}
                            {c.country && (
                              <span className="text-[10px] text-neutral-500 font-normal block font-mono">
                                {c.country}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-neutral-200">
                            <span className="font-semibold">{c.artistName || c.name}</span>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-neutral-300">
                            {c.email}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-block ${
                                c.status === 'active'
                                  ? 'text-orange-400 bg-orange-950/40 border-orange-800'
                                  : c.status === 'pending_activation'
                                  ? 'text-amber-400 bg-amber-950/40 border-amber-800'
                                  : 'text-orange-400 bg-orange-950/40 border-orange-800'
                              }`}
                            >
                              {c.status === 'active' ? 'Active' : c.status === 'pending_activation' ? 'Pending Activation' : 'Banned / Terminated'}
                            </span>
                            {c.status === 'disabled' && c.disabledReason && (
                              <span className="text-[10px] text-orange-300/80 block max-w-[220px] mt-1 truncate" title={c.disabledReason}>
                                Reason: {c.disabledReason}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 min-w-[180px]">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${c.contractAcceptedAt ? 'border-orange-800 bg-orange-950/40 text-orange-300' : 'border-amber-800 bg-amber-950/30 text-amber-300'}`}>{c.contractAcceptedAt ? 'Signed' : 'Not signed'}</span>
                            {c.contractAcceptedAt && <><span className="mt-1 block text-[10px] text-neutral-500">{new Date(c.contractAcceptedAt).toLocaleString()}</span><button type="button" onClick={() => { const blob = new Blob([c.contractText || 'Signed agreement text unavailable.'], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `STB Academy-Agreement-${c.name.replace(/[^a-z0-9]+/gi,'-')}.txt`; a.click(); URL.revokeObjectURL(url); }} className="mt-1 text-[10px] font-semibold text-orange-300 underline">Download contract</button></>}
                          </td>

                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => {
                                setSelectedClientForView(c);
                                setActiveTab('releases');
                              }}
                              className="text-orange-400 hover:underline font-mono font-semibold"
                            >
                              {c.releasesCount || 0} release(s)
                            </button>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-neutral-400">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isSuperAdmin && <button
                                type="button"
                                onClick={() => openEditClient(c)}
                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white text-[11px] rounded flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                                title="Edit client name, surname, and account details"
                              >
                                <Sliders className="w-3 h-3" />
                                Edit
                              </button>}
                              <button
                                type="button"
                                onClick={() => handleAccessClientAccount(c)}
                                disabled={accessingClientId === c.id}
                                className="px-2.5 py-1 bg-orange-600/90 hover:bg-orange-600 text-white text-[11px] rounded flex items-center gap-1 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                title="Access and view client account without password"
                              >
                                {accessingClientId === c.id ? (
                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                                <span>Access Client Account</span>
                              </button>

                              {isSuperAdmin && <button
                                onClick={() => handleToggleClientStatus(c)}
                                className={`text-[11px] px-2.5 py-1 rounded transition-colors font-semibold ${
                                  c.status === 'disabled'
                                    ? 'text-orange-400 bg-orange-950/60 border border-orange-800'
                                    : 'text-neutral-400 hover:text-orange-400 bg-neutral-900 border border-neutral-800'
                                }`}
                              >
                                {c.status === 'disabled' ? 'Re-activate' : 'Ban / Terminate'}
                              </button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: ENQUIRIES */}
        {activeTab === 'enquiries' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-white font-['Space_Grotesk']">
                Inbound Website Enquiries
              </h3>
              <p className="text-xs text-neutral-400">
                Inquiries submitted through the STB Academy contact form.
              </p>
            </div>

            {enquiries.length === 0 ? (
              <div className="p-8 text-center bg-neutral-900/30 border border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs">
                No enquiries received yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {enquiries.map((enq) => (
                  <div
                    key={enq.id}
                    className="p-5 bg-neutral-900/60 border border-neutral-800 rounded-2xl space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-orange-500 shrink-0">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-white font-['Space_Grotesk']">
                            {enq.subject}
                          </h4>
                          <span className="text-[11px] text-neutral-400">
                            From: <strong className="text-neutral-200">{enq.name}</strong> ({enq.email})
                            {enq.phone && ` · Phone: ${enq.phone}`}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono text-neutral-500">
                        {new Date(enq.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-xl text-xs text-neutral-300 leading-relaxed">
                      {enq.message}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <a
                        href={`mailto:${enq.email}?subject=Re: ${encodeURIComponent(enq.subject)} - STB Academy - Distribution`}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Reply via Email</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {!isSuperAdmin && <RoyaltyWithdrawalModal isOpen={payoutModalOpen} summary={adminRoyaltySummary} payoutProfile={user?.payoutProfile} onClose={()=>setPayoutModalOpen(false)} onProfileLinked={()=>void refreshUser()} onSubmitted={(summary,withdrawal)=>{setAdminRoyaltySummary(summary);setRoyaltyWithdrawals(prev=>[withdrawal,...prev]);void refreshUser();}} />}
      {tutorialOpen && <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-orange-400">STB Academy administrator guide</p><h2 className="mt-1 text-xl font-bold text-white">Get started with your admin portal</h2><p className="mt-2 text-xs text-neutral-400">A quick guide to the tools available to both administrators.</p></div><button onClick={closeTutorial} className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-white">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{[{t:'Releases Management',d:'Review audio releases, inspect metadata and artwork, approve, deny, request corrections, update delivery status, download submitted assets and manage eligible pre-save links.'},{t:'Clients & Artists',d:'View client accounts, search artists, register clients, edit account details, disable access and open a client dashboard when support is needed.'},{t:'Email Campaigns',d:'Select registered client recipients, compose a subject and message, preview the email, send a test and send campaigns. Campaign history records delivery results.'},{t:'Enquiries',d:'Review and respond to messages submitted through the public contact form.'},{t:'Royalties & Withdrawals',d:'Assign admin royalty allocations, set gross release royalties, review PayPal payment requests and mark completed payments Paid.'},{t:'Settings',d:'Change the website logo, configure public social-media buttons, and export or restore application data backups.'},{t:'Video Submissions',d:'Review video metadata, artwork and the required external video master download link. Final delivery and royalty controls are restricted.'}].map(item=><div key={item.t} className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4"><h3 className="text-sm font-bold text-white">{item.t}</h3><p className="mt-2 text-xs leading-5 text-neutral-400">{item.d}</p></div>)}</div><div className="mt-5 flex justify-end"><button onClick={closeTutorial} className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white">Finish tutorial</button></div></div></div>}

      {/* MODAL: PRE-SAVE LINK MANAGER */}
      {preSaveRelease && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 sm:p-7 overflow-hidden">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-orange-500" />
                  Manage Pre-save Links
                </h3>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {preSaveRelease.title} · {preSaveRelease.refNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!preSaveSaving) setPreSaveRelease(null); }}
                disabled={preSaveSaving}
                className="text-neutral-400 hover:text-white disabled:opacity-40"
                aria-label="Close pre-save manager"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              {(preSaveRelease.preSaveLinks || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/50 p-5 text-center text-xs text-neutral-500">
                  No pre-save links have been added yet.
                </div>
              ) : (
                (preSaveRelease.preSaveLinks || []).map((link) => (
                  <div key={link.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate">{link.label}</div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-orange-400 hover:text-orange-300 truncate block mt-1"
                      >
                        {link.url}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePreSaveLink(link.id)}
                      disabled={preSaveSaving}
                      className="shrink-0 p-2 text-neutral-500 hover:text-orange-400 hover:bg-neutral-800 rounded-lg disabled:opacity-40"
                      title="Remove pre-save link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAddPreSaveLink();
              }}
              className="space-y-3 border-t border-neutral-800 pt-5"
            >
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Link Label</label>
                <input
                  type="text"
                  value={preSaveLabel}
                  onChange={(e) => setPreSaveLabel(e.target.value)}
                  placeholder="e.g. Spotify Pre-save"
                  maxLength={80}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Pre-save URL <span className="text-orange-500">*</span></label>
                <input
                  type="url"
                  required
                  value={preSaveUrl}
                  onChange={(e) => setPreSaveUrl(e.target.value)}
                  placeholder="https://..."
                  maxLength={2000}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPreSaveRelease(null)}
                  disabled={preSaveSaving}
                  className="flex-1 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold disabled:opacity-40"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={preSaveSaving || !preSaveUrl.trim()}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {preSaveSaving ? 'Saving...' : 'Add Pre-save Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT RELEASE ROYALTY */}
      {royaltyRelease && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div><h3 className="text-base font-bold text-white">Set Release Royalty</h3><p className="text-[11px] text-neutral-500 mt-1">{royaltyRelease.title} · {royaltyRelease.refNumber}</p></div>
              <button type="button" onClick={() => setRoyaltyRelease(null)} disabled={royaltySaving} className="text-neutral-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={saveRoyaltyAmount} className="space-y-4">
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-neutral-300">Gross Royalty Received (ZAR)</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">R</span><input autoFocus required type="number" min="0" step="0.01" value={royaltyAmountInput} onChange={e => setRoyaltyAmountInput(e.target.value)} className="field pl-8" /></div></label>
              <p className="text-[11px] text-neutral-400">Artist receives 80%: <strong className="text-orange-300">R{(Math.max(0, Number(royaltyAmountInput) || 0) * 0.8).toFixed(2)}</strong>. Normal admin 10%: <strong className="text-neutral-200">R{(Math.max(0, Number(royaltyAmountInput) || 0) * 0.1).toFixed(2)}</strong>. Super admin 10%: <strong className="text-neutral-200">R{(Math.max(0, Number(royaltyAmountInput) || 0) * 0.1).toFixed(2)}</strong>. Only the artist share is added to their withdrawal balance.</p>
              <div className="flex gap-3"><button type="button" onClick={() => setRoyaltyRelease(null)} disabled={royaltySaving} className="flex-1 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-xl text-xs font-bold">Cancel</button><button type="submit" disabled={royaltySaving} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold">{royaltySaving ? 'Saving...' : 'Save Royalty'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL CLIENT REGISTRATION */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden">
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white font-['Space_Grotesk'] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-orange-500" />
                <span>Register Client Manually</span>
              </h3>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {regSuccessResult ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-full bg-orange-950 border border-orange-800 text-orange-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Client Successfully Registered!</h4>
                <p className="text-xs text-neutral-400">
                  Account is ready. The client can now sign in directly using a one-time code sent to their registered email.
                </p>
                
                <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-left space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Artist:</span>
                    <span className="font-bold text-white">{regSuccessResult.client.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Registered Email:</span>
                    <span className="font-mono text-white">{regSuccessResult.client.email}</span>
                  </div>
                  <div className="border-t border-neutral-800 pt-2 text-[11px] text-orange-400/90">
                    Client logs in via Email + one-time code (OTP). No password required.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const msg = `Hi ${regSuccessResult.client.name}! Your STB Academy music distribution account is registered. Visit / and sign in using your registered email (${regSuccessResult.client.email}).`;
                      navigator.clipboard.writeText(msg);
                      setCopiedInstructions(true);
                      setTimeout(() => setCopiedInstructions(false), 2500);
                    }}
                    className="flex-1 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    {copiedInstructions ? <Check className="w-3.5 h-3.5 text-orange-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedInstructions ? 'Message Copied!' : 'Copy Client Message'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsRegisterModalOpen(false);
                      setRegSuccessResult(null);
                    }}
                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleManualRegisterSubmit} className="space-y-4">
                <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-neutral-300">
                  Register the client's email. They will sign in via <strong>Email OTP</strong> using a single-use code — no password is required.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">First Name <span className="text-orange-500">*</span></label>
                    <input type="text" required value={regFirstName} onChange={(e) => setRegFirstName(e.target.value)} placeholder="First name" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Surname <span className="text-orange-500">*</span></label>
                    <input type="text" required value={regSurname} onChange={(e) => setRegSurname(e.target.value)} placeholder="Surname" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Artist Name <span className="text-orange-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Artist Name"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Client Email Address <span className="text-orange-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="artist@recordlabel.com"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+27 82 000 0000"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{regSubmitting ? 'Registering...' : 'Register Client Account'}</span>
                </button>
              </form>
            )}

          </div>
        </div>
      )}

      {deactivationClient && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-neutral-950 border border-orange-900/60 rounded-2xl shadow-2xl p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-950/60 border border-orange-900/60 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ban / Terminate Client Account</h3>
                  <p className="text-[11px] text-neutral-500 mt-1">{deactivationClient.realFirstName || deactivationClient.name} · {deactivationClient.email}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDeactivationClient(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
            <div className="p-3 rounded-xl bg-orange-950/20 border border-orange-900/50 text-xs text-orange-200 mb-4">
              This will restrict the client from submitting releases, uploading assets, accessing royalties, requesting withdrawals, and other client actions. The account will be marked <strong>Banned / Terminated</strong>.
            </div>
            <form onSubmit={handleConfirmDeactivation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Reason for deactivation / termination <span className="text-orange-500">*</span></label>
                <textarea required value={deactivationReason} onChange={e => setDeactivationReason(e.target.value)} rows={5} placeholder="Explain why this client account is being banned or terminated..." className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600 resize-none" />
                <p className="text-[10px] text-neutral-500 mt-1.5">This reason will be saved with the client account and shown to the client when they sign in.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setDeactivationClient(null)} disabled={deactivationSaving} className="flex-1 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={deactivationSaving || !deactivationReason.trim()} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                  <Ban className="w-3.5 h-3.5" />
                  {deactivationSaving ? 'Saving...' : 'Ban / Terminate Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {editingClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-white">Edit Client Details</h3>
                <p className="text-[11px] text-neutral-500 mt-1">{editingClient.email}</p>
              </div>
              <button type="button" onClick={() => setEditingClient(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={saveClientDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">First Name</label>
                  <input required value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Surname</label>
                  <input required value={editSurname} onChange={e => setEditSurname(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-600" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Artist Name</label>
                <input required value={editArtistName} onChange={e => setEditArtistName(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-600" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditingClient(null)} className="flex-1 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={editSaving} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold">{editSaving ? 'Saving...' : 'Save Details'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
