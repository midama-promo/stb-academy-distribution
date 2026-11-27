import React, { useState, useEffect } from 'react';
import { VideoSubmissions } from '../common/VideoSubmissions';
import { AudioSubmissions } from './AudioSubmissions';
import {
  LogOut,
  Search,
  Filter,
  Disc,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Play,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Layers,
  Calendar,
  Bell,
  Download,
  FileCheck,
  Eye,
  MessageSquare,
  Wallet,
  Banknote,
  Music,
  Link2,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Release, ReleaseStatus, WithdrawalRequest } from '../../types';
import { api } from '../../services/api';
import { Logo } from '../common/Logo';
import { RoyaltyWithdrawalModal } from './RoyaltyWithdrawalModal';
import { SupportChat } from '../common/SupportChat';

interface ClientDashboardProps {
  onSelectRelease: (release: Release) => void;
  onOpenSharePage: (refNumber: string) => void;
  onOpenNotifications: () => void;
  onGoHome: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  onSelectRelease,
  onOpenSharePage,
  onOpenNotifications,
  onGoHome,
}) => {
  const { user, logout, isImpersonating, exitClientAccount, refreshUser } = useAuth();
  const isAccountRestricted = user?.status === 'disabled';
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [royaltySummary, setRoyaltySummary] = useState({ totalEarnings: 0, pendingAmount: 0, paidAmount: 0, availableAmount: 0 });
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [contractText, setContractText] = useState('');
  const [contractAccepted, setContractAccepted] = useState(false);
  const [contractChecked, setContractChecked] = useState(false);
  const [contractBusy, setContractBusy] = useState(false);
  const [contractError, setContractError] = useState('');
  const [contractSignature, setContractSignature] = useState('');
  const [spotifyClaimed, setSpotifyClaimed] = useState<boolean | null>(
    typeof user?.spotifyProfileClaimed === 'boolean' ? user.spotifyProfileClaimed : null
  );
  const [spotifyClaimSaving, setSpotifyClaimSaving] = useState(false);
  const [spotifyClaimMessage, setSpotifyClaimMessage] = useState<string | null>(null);
  const [topicChannelLinks, setTopicChannelLinks] = useState<string[]>(['']);
  const [originalYoutubeChannel, setOriginalYoutubeChannel] = useState('');
  const [oacArtistName, setOacArtistName] = useState(user?.artistName || user?.name || '');
  const [oacSubmitting, setOacSubmitting] = useState(false);
  const [oacMessage, setOacMessage] = useState<{type:'success'|'error';text:string}|null>(null);

  useEffect(() => {
    if (!user || user.role !== 'client') return;
    api.getContract().then(result => { setContractText(result.contractText || ''); setContractAccepted(!!result.accepted); }).catch(err => setContractError(err?.message || 'Could not load the artist agreement.'));
  }, [user?.id]);

  const signArtistContract = async () => {
    if (!contractChecked) { setContractError('Tick the agreement checkbox to continue.'); return; }
    const artist = String(user?.artistName || user?.name || 'Artist').trim();
    const signature = `✍ ${artist} · STB-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    setContractBusy(true); setContractError('');
    try {
      const result = await api.acceptContract(signature);
      setContractText(result.contractText); setContractSignature(result.signature); setContractAccepted(true);
    } catch (e: any) { setContractError(e?.message || 'Could not save your agreement.'); }
    finally { setContractBusy(false); }
  };

  const downloadArtistContract = () => {
    if (!contractText) return;
    const blob = new Blob([contractText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'STB-Academy-Artist-Distribution-Agreement.txt'; a.click(); URL.revokeObjectURL(url);
  };

  const fetchReleases = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      // Release submissions are the single source of release records.
      const releaseRes = await api.getReleases();
      setReleases(releaseRes.releases);
      // Main dashboard data is ready; don't make clients wait for royalty requests
      // before the release list becomes visible.
      if (showSpinner) setLoading(false);
      if (!isAccountRestricted) {
        const royaltyRes = await api.getRoyaltySummary();
        setRoyaltySummary({ totalEarnings: royaltyRes.totalEarnings, pendingAmount: royaltyRes.pendingAmount, paidAmount: royaltyRes.paidAmount, availableAmount: royaltyRes.availableAmount });
        setWithdrawals(royaltyRes.withdrawals || []);
      } else {
        setRoyaltySummary({ totalEarnings: 0, pendingAmount: 0, paidAmount: 0, availableAmount: 0 });
        setWithdrawals([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load releases.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    fetchReleases();
  }, [isAccountRestricted]);

  useEffect(() => {
    setSpotifyClaimed(typeof user?.spotifyProfileClaimed === 'boolean' ? user.spotifyProfileClaimed : null);
  }, [user?.spotifyProfileClaimed]);

  const submitOacRequest = async () => {
    const links = topicChannelLinks.map(link => link.trim()).filter(Boolean);
    const validUrl = (value: string) => { try { const url = new URL(value); return ['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be'].includes(url.hostname.toLowerCase()) && (url.protocol === 'http:' || url.protocol === 'https:'); } catch { return false; } };
    if (!oacArtistName.trim()) { setOacMessage({type:'error',text:'Enter the artist name for this request.'}); return; }
    if (!validUrl(originalYoutubeChannel.trim())) { setOacMessage({type:'error',text:'Enter a valid original YouTube channel URL.'}); return; }
    if (links.length < 1 || links.length > 5 || links.some(link => !validUrl(link))) { setOacMessage({type:'error',text:'Enter at least one valid Topic channel URL, with a maximum of five.'}); return; }
    setOacSubmitting(true); setOacMessage(null);
    try {
      const result = await api.submitOacRequest({artistName:oacArtistName.trim(),topicChannelLinks:links,originalYoutubeChannel:originalYoutubeChannel.trim()});
      setOacMessage({type:'success',text:result.message || 'Your request has been submitted to the super administrator.'});
      setTopicChannelLinks(['']); setOriginalYoutubeChannel('');
    } catch (err:any) {
      setOacMessage({type:'error',text:err?.message || 'Could not submit your Official Artist Channel request.'});
    } finally { setOacSubmitting(false); }
  };

  const saveSpotifyClaimStatus = async (claimed: boolean) => {
    if (spotifyClaimSaving) return;
    setSpotifyClaimSaving(true);
    setSpotifyClaimMessage(null);
    try {
      const result = await api.setSpotifyProfileClaimed(claimed);
      setSpotifyClaimed(result.user.spotifyProfileClaimed ?? claimed);
      setSpotifyClaimMessage(result.message);
    } catch (err: any) {
      setSpotifyClaimMessage(err.message || 'Could not save your confirmation. Please try again.');
    } finally {
      setSpotifyClaimSaving(false);
    }
  };

  // Listen to stbacademy:release-submitted event for instantaneous dashboard update without refresh
  useEffect(() => {
    const handleReleaseSubmitted = (e: Event) => {
      const customEvent = e as CustomEvent<Release>;
      const newRel = customEvent.detail;
      if (newRel) {
        setReleases((prev) => {
          const filtered = prev.filter(
            (r) => r.id !== newRel.id && r.refNumber !== newRel.refNumber
          );
          return [newRel, ...filtered];
        });
        fetchReleases(false);
      }
    };

    window.addEventListener('stbacademy:release-submitted', handleReleaseSubmitted);
    return () => {
      window.removeEventListener('stbacademy:release-submitted', handleReleaseSubmitted);
    };
  }, []);

  useEffect(() => {
    const handleReleaseDeleted = (e: Event) => { const id=(e as CustomEvent<{id:string}>).detail?.id; if(id) setReleases(prev=>prev.filter(r=>r.id!==id)); };
    window.addEventListener('stbacademy:release-deleted',handleReleaseDeleted);
    return ()=>window.removeEventListener('stbacademy:release-deleted',handleReleaseDeleted);
  },[]);

  useEffect(() => {
    const handleStatusUpdated = (e: Event) => {
      const updated = (e as CustomEvent<Release>).detail;
      if (updated?.id) setReleases(prev => prev.map(r => r.id === updated.id ? updated : r));
    };
    window.addEventListener('stbacademy:release-status-updated', handleStatusUpdated);
    return () => window.removeEventListener('stbacademy:release-status-updated', handleStatusUpdated);
  }, []);

  const handleCopyLink = (refNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}?ref=${refNumber}`;
    navigator.clipboard.writeText(url);
    setCopiedRef(refNumber);
    setTimeout(() => setCopiedRef(null), 2000);
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
        return 'text-blue-400 bg-blue-950/40 border-blue-800/80';
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
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.refNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.primaryArtists.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className={`min-h-screen text-neutral-100 pb-20 transition-colors duration-500 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.10),_transparent_45%),#08080d]`}>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Admin Impersonation Notice Bar */}
      {isImpersonating && (
        <div className="bg-amber-400 text-neutral-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-lg sticky top-0 z-40 border-b border-amber-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
            <span>Admin Support Session: Viewing client portal for <strong>{user?.name}</strong> ({user?.email})</span>
          </div>
          <button
            onClick={exitClientAccount}
            className="px-3 py-1 bg-neutral-950 hover:bg-neutral-800 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
          >
            ← Return to Admin Portal
          </button>
        </div>
      )}

      {/* Top Client Portal Bar */}
      <header className={`sticky top-0 z-30 backdrop-blur-md px-4 sm:px-6 lg:px-8 bg-neutral-950/95 border-b border-orange-900/40`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <Logo size="md" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs font-mono font-bold">
              <span>CLIENT DASHBOARD</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">


            <a href="mailto:djyslactrumpza@gmail.com?subject=STB Academy%20MG%20Query" className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-colors" title="Contact STB Academy">
              <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
              <span>Make a Query</span>
            </a>

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
              title="Notifications Audit Log"
            >
              <Bell className="w-5 h-5" />
            </button>

            <button
              onClick={logout}
              className="p-2 text-neutral-400 hover:text-orange-400 hover:bg-neutral-900 rounded-xl transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>



      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {isAccountRestricted && (
          <div className="bg-orange-950/30 border border-orange-900/70 rounded-2xl p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-950 border border-orange-900 flex items-center justify-center shrink-0"><ShieldAlert className="w-5 h-5 text-orange-400" /></div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-orange-300">Account Banned / Terminated</h2>
                <p className="text-xs text-neutral-300 mt-1">Your STB Academy client account has been deactivated by the administrator. Release submissions, royalty access, withdrawals, uploads, and other client actions are currently unavailable.</p>
                {user?.disabledReason && <div className="mt-3 p-3 bg-neutral-950/70 border border-orange-900/50 rounded-xl text-xs text-orange-200"><strong>Reason:</strong> {user.disabledReason}</div>}
                <p className="text-[11px] text-neutral-500 mt-3">If you believe this was done in error, contact STB Academy administration.</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Artist Profile Header / Welcome Banner */}
        <div className={`border rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden bg-gradient-to-br from-orange-950/35 via-neutral-900/80 to-neutral-950 border-orange-900/40`}>
          <div className="absolute top-0 right-0 w-80 h-80 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-400">
              <span className={`w-2 h-2 rounded-full ${isAccountRestricted ? 'bg-orange-500' : 'bg-orange-500'}`} />
              <span>Client Portal</span>
              <span className="text-neutral-600">·</span>
              <span className="text-neutral-300 font-bold">{user?.email}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-['Space_Grotesk']">
              Welcome, {user?.name || 'Artist / Label'}
            </h1>

            <p className="text-xs sm:text-sm text-neutral-400 max-w-xl">
              Manage your STB Academy audio and video submissions, review progress, royalty balance, withdrawal requests and signed artist agreement.
            </p>
          </div>

          <div className="flex items-center gap-3">
          </div>
        </div>


        {!isImpersonating && <div id="stb-audio-submissions"><AudioSubmissions onSubmitted={() => void fetchReleases(false)} /></div>}
        <div id="stb-video-submissions"><VideoSubmissions readOnly={isImpersonating} /></div>
        {!isAccountRestricted && !isImpersonating && <div className="mb-8"><SupportChat /></div>}
        <section className="mb-8 rounded-2xl border border-orange-900/40 bg-gradient-to-br from-orange-950/35 to-neutral-950 p-5">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-orange-400">Artist services · no STB Academy application fee</p>
          <h2 className="mt-1 text-lg font-bold text-white">YouTube Official Artist Channel</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-400">Submit your Official Artist Channel request directly through your client portal. Your details will appear in the STB Academy super-admin dashboard for review; no email needs to be prepared or sent. Approval remains subject to YouTube and distribution-partner eligibility.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-300 sm:col-span-2">Artist name<input type="text" value={oacArtistName} onChange={e=>setOacArtistName(e.target.value)} placeholder="Artist name" className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white"/></label>
            <div className="text-xs text-neutral-300 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between"><span>YouTube Topic channel links (at least 1, maximum 5)</span><button type="button" disabled={topicChannelLinks.length>=5 || oacSubmitting} onClick={()=>setTopicChannelLinks(v=>[...v,''])} className="rounded-lg bg-neutral-800 px-3 py-2 text-[11px] text-white disabled:opacity-40">+ Add Topic link</button></div>
              {topicChannelLinks.map((link,index)=><div key={index} className="mb-2 flex gap-2"><input type="url" value={link} onChange={e=>setTopicChannelLinks(v=>v.map((x,i)=>i===index?e.target.value:x))} placeholder={`https://www.youtube.com/channel/... (Topic link ${index+1})`} className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white"/>{topicChannelLinks.length>1&&<button type="button" disabled={oacSubmitting} onClick={()=>setTopicChannelLinks(v=>v.filter((_,i)=>i!==index))} className="px-2 text-xs text-red-300 disabled:opacity-40">Remove</button>}</div>)}
            </div>
            <label className="text-xs text-neutral-300 sm:col-span-2">Original YouTube channel URL<input type="url" value={originalYoutubeChannel} onChange={e=>setOriginalYoutubeChannel(e.target.value)} placeholder="https://www.youtube.com/@YourChannel" className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white"/></label>
          </div>
          {oacMessage && <div role="status" className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${oacMessage.type==='success'?'border-emerald-800 bg-emerald-950/30 text-emerald-300':'border-red-800 bg-red-950/30 text-red-300'}`}>{oacMessage.text}</div>}
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={submitOacRequest} disabled={oacSubmitting || isImpersonating || isAccountRestricted} className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50">{oacSubmitting?'Submitting request…':'Submit OAC Request'}</button><span className="text-[10px] text-neutral-500">Your request is saved securely in the platform for super-admin review.</span></div>
        </section>


        {/* Customer Submission Status Metrics */}
        {releases.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-xl space-y-1">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">Total Submissions</span>
              <span className="text-2xl font-bold text-white font-['Space_Grotesk']">{releases.length}</span>
            </div>

            <div className="p-4 bg-amber-950/20 border border-amber-900/50 rounded-xl space-y-1">
              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block">Under Review</span>
              <span className="text-2xl font-bold text-amber-400 font-['Space_Grotesk']">
                {releases.filter(r => r.status === 'Pending Review').length}
              </span>
            </div>

            <div className="p-4 bg-orange-950/20 border border-orange-900/50 rounded-xl space-y-1">
              <span className="text-[10px] font-mono text-orange-400 uppercase tracking-wider block">Corrections Needed</span>
              <span className="text-2xl font-bold text-orange-400 font-['Space_Grotesk']">
                {releases.filter(r => r.status === 'Corrections Required').length}
              </span>
            </div>

            <div className="p-4 bg-orange-950/20 border border-orange-900/50 rounded-xl space-y-1">
              <span className="text-[10px] font-mono text-orange-400 uppercase tracking-wider block">Approved</span>
              <span className="text-2xl font-bold text-orange-400 font-['Space_Grotesk']">
                {releases.filter(r => r.status === 'Approved').length}
              </span>
            </div>

            <div className="p-4 bg-blue-950/20 border border-blue-900/50 rounded-xl space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider block">Completed</span>
              <span className="text-2xl font-bold text-blue-400 font-['Space_Grotesk']">
                {releases.filter(r => r.status === 'Completed').length}
              </span>
            </div>
          </div>
        )}

        {/* Administrator Feedback / Actions Notice if any release requires corrections */}
        {releases.some(r => r.status === 'Corrections Required' && r.adminNotes) && (
          <div className="p-4 bg-orange-950/30 border border-orange-800/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-orange-400 text-xs font-bold font-['Space_Grotesk']">
                <AlertTriangle className="w-4 h-4" />
                <span>Action Required: Administrator Feedback</span>
              </div>
              <span className="text-[10px] font-mono text-orange-400">Please review & update</span>
            </div>
            {releases.filter(r => r.status === 'Corrections Required' && r.adminNotes).map(r => (
              <div
                key={r.id}
                onClick={() => onSelectRelease(r)}
                className="p-3 bg-neutral-900/80 hover:bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-between cursor-pointer group transition-all"
              >
                <div>
                  <span className="font-mono text-[11px] font-bold text-orange-400 mr-2">{r.refNumber}</span>
                  <strong className="text-xs text-white">{r.title}:</strong>
                  <span className="text-xs text-neutral-300 ml-2 italic font-mono">"{r.adminNotes}"</span>
                </div>
                <span className="text-xs text-orange-400 group-hover:underline flex items-center gap-1 shrink-0 ml-3">
                  <span>View Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Real Summary Bar (Only shown if user has submitted releases) */}
        {releases.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Search releases by title or ref number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-600"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs text-neutral-400 font-mono flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5" /> Filter:
              </span>
              {['All', 'Pending Review', 'Review Passed', 'Approved', 'Delivered', 'Completed', 'Corrections Required', 'Denied'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
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
        )}

        {/* Release Catalogue Section */}
        <div id="stb-release-list">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono text-neutral-400">Loading your releases...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-orange-950/40 border border-orange-800 rounded-2xl text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" />
            <p className="text-xs text-orange-300">{error}</p>
            <button
              onClick={() => fetchReleases(true)}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded-xl"
            >
              Retry
            </button>
          </div>
        ) : releases.length === 0 ? (
          /* EMPTY STATE AS REQUIRED BY USER */
          <div className="py-24 bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl text-center space-y-4 p-8">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-600">
              <Disc className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-white font-['Space_Grotesk']">
                No releases submitted yet.
              </h3>
              <p className="text-xs text-neutral-400">
                No previous releases are recorded in this portal. Use the new Artist Distribution Portal for all new distribution submissions.
              </p>
            </div>
          </div>
        ) : filteredReleases.length === 0 ? (
          <div className="py-16 bg-neutral-900/20 border border-neutral-800 rounded-2xl text-center space-y-2 p-6">
            <p className="text-xs text-neutral-400">No releases match the selected filter "{statusFilter}".</p>
            <button
              onClick={() => { setStatusFilter('All'); setSearchQuery(''); }}
              className="text-xs text-orange-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredReleases.map((rel) => (
              <div
                key={rel.id}
                onClick={() => onSelectRelease(rel)}
                className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 hover:bg-neutral-900/90 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  {/* Ref number & Status */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-mono font-bold text-orange-400">
                      {rel.refNumber}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getStatusBadge(rel.status)}`}>
                      {rel.status}
                    </span>
                  </div>

                  {/* Artwork & Title */}
                  <div className="flex items-center gap-4 mb-4">
                    <img
                      src={rel.artworkUrl}
                      alt={rel.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
                      }}
                      className="w-16 h-16 rounded-xl object-cover border border-neutral-700 shadow-md shrink-0 group-hover:scale-105 transition-transform"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-neutral-400 block">
                        {rel.releaseType} · {rel.genre}
                      </span>
                      <h3 className="text-base font-bold text-white font-['Space_Grotesk'] truncate group-hover:text-orange-400 transition-colors">
                        {rel.title}
                      </h3>
                      <p className="text-xs text-neutral-400 truncate">
                        {rel.primaryArtists.join(', ')}
                        {rel.featuredArtists && rel.featuredArtists.length > 0 && ` feat. ${rel.featuredArtists.join(', ')}`}
                      </p>
                    </div>
                  </div>

                  {!isAccountRestricted && (
                    <div className="mb-3 p-3 rounded-xl bg-orange-950/20 border border-orange-900/60 flex items-center justify-between gap-3">
                      <div><span className="text-[10px] uppercase tracking-wider text-neutral-500 block">Release Royalty</span><strong className="text-lg text-orange-400">R{Number(rel.royaltyAmount || 0).toFixed(2)}</strong></div>
                      <span className="text-[10px] text-neutral-500">Assigned by STB Academy</span>
                    </div>
                  )}

                  {/* Feedback / Notes callouts */}
                  {rel.status === 'Denied' && rel.denialReason && (
                    <div className="mb-3 p-2.5 rounded-lg text-xs bg-orange-950/40 text-orange-300 border border-orange-800/80 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400" />
                      <div>
                        <span className="font-bold block">Denial Reason:</span>
                        <p className="text-[11px] leading-relaxed">{rel.denialReason}</p>
                      </div>
                    </div>
                  )}

                  {(rel.status === 'Review Passed' || rel.status === 'Delivered') && (
                    <div className={`mb-3 p-2.5 rounded-lg text-xs border flex items-center gap-1.5 ${rel.status === 'Delivered' ? 'bg-cyan-950/30 text-cyan-300 border-cyan-800/60' : 'bg-orange-950/30 text-orange-300 border-orange-800/60'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[11px]">
                        {rel.status === 'Review Passed'
                          ? 'Your release has passed STB Academy review.'
                          : 'Your release has been marked as delivered.'}
                      </span>
                    </div>
                  )}

                  {rel.status === 'Corrections Required' && rel.adminNotes && (
                    <div className="mb-3 p-2.5 rounded-lg text-xs bg-orange-950/40 text-orange-300 border border-orange-800/80 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400" />
                      <div>
                        <span className="font-bold block">Administrator Feedback:</span>
                        <p className="text-[11px] leading-relaxed">{rel.adminNotes}</p>
                      </div>
                    </div>
                  )}

                  {(['Approved','Completed','Delivered','In Distribution'].includes(rel.status)) && (
                    <>
                      <div className="mb-3 p-2 rounded-lg text-xs bg-orange-950/30 text-orange-300 border border-orange-800/60 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="text-[11px]">{rel.status === 'Delivered' ? 'Delivered' : rel.status === 'In Distribution' ? 'In distribution' : rel.status === 'Completed' ? 'Distribution completed' : 'Approved by STB Academy Administrator'}</span>
                      </div>

                      {(rel.preSaveLinks || []).length > 0 && (
                        <div className="mb-3 p-3 rounded-xl bg-neutral-950/70 border border-neutral-800" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2 mb-2">
                            <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400">Pre-save Links</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(rel.preSaveLinks || []).map((link) => (
                              <a
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/10 border border-orange-700/60 text-orange-300 hover:bg-orange-600 hover:text-white transition-colors text-[11px] font-bold"
                              >
                                {link.label}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mb-3 flex items-center justify-between rounded-lg border border-orange-900/40 bg-orange-950/10 px-3 py-2"><span className="text-[10px] uppercase tracking-wider text-neutral-400">Artist royalty on this release</span><strong className="text-sm text-orange-300">R{Number(rel.royaltyAmount||0).toFixed(2)}</strong></div>

                {/* Bottom Bar: Submission Date & Actions */}
                <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                  <span className="text-[10px] font-mono text-neutral-500">
                    Submitted: {new Date(rel.submittedAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleCopyLink(rel.refNumber, e)}
                      className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                      title="Copy Reference Link"
                    >
                      {copiedRef === rel.refNumber ? <Check className="w-3.5 h-3.5 text-orange-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    <span className="text-neutral-500 flex items-center gap-0.5 text-[11px] group-hover:text-orange-400 transition-colors">
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        {/* Integrated Royalty Dashboard */}
        {!isAccountRestricted && <section id="stb-royalty-section" className="space-y-4">
          <div className="bg-gradient-to-r from-neutral-900/95 via-neutral-900/70 to-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div>
                <h2 className="text-base font-bold text-white font-['Space_Grotesk'] flex items-center gap-2"><Wallet className="w-4 h-4 text-orange-400" /> Royalties & Withdrawals</h2>
                <p className="text-xs text-neutral-400 mt-1 max-w-xl">Your royalty earnings are assigned to your releases by the STB Academy administrator. You can request payment of your available balance using your linked PayPal details.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800"><span className="text-[10px] uppercase tracking-wider text-neutral-500 block">Total Earnings</span><strong className="text-xl text-white">R{royaltySummary.totalEarnings.toFixed(2)}</strong></div>
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800"><span className="text-[10px] uppercase tracking-wider text-neutral-500 block">Available</span><strong className="text-xl text-orange-400">R{royaltySummary.availableAmount.toFixed(2)}</strong></div>
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800"><span className="text-[10px] uppercase tracking-wider text-neutral-500 block">Pending Withdrawal</span><strong className="text-xl text-amber-400">R{royaltySummary.pendingAmount.toFixed(2)}</strong></div>
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800"><span className="text-[10px] uppercase tracking-wider text-neutral-500 block">Already Paid</span><strong className="text-xl text-blue-400">R{royaltySummary.paidAmount.toFixed(2)}</strong></div>
            </div>

            <div className="mt-5 pt-5 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-[11px] text-neutral-500 text-center sm:text-left">PayPal status: {(user?.payoutProfile || user?.payoutLinked) ? 'Linked' : 'Not linked'}. Available funds can be requested using your linked payout details.</p>
              <button type="button" onClick={() => setWithdrawalOpen(true)} disabled={isImpersonating} className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-md shrink-0"><Banknote className="w-4 h-4" /> Link PayPal / Request Payment</button>
            </div>
          </div>

          {withdrawals.length > 0 && (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-white">Withdrawal History</h3><span className="text-[10px] text-neutral-500">Latest requests</span></div>
              <div className="space-y-2">
                {withdrawals.slice(0, 5).map(w => (
                  <div key={w.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    <div><span className="font-bold text-white text-xs">R{w.amount.toFixed(2)}</span><span className="text-[10px] text-neutral-500 ml-2">{new Date(w.createdAt).toLocaleString()}</span></div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded border w-fit ${w.status === 'paid' ? 'text-orange-400 bg-orange-950/40 border-orange-800' : w.status === 'pending' ? 'text-amber-400 bg-amber-950/40 border-amber-800' : 'text-neutral-400 bg-neutral-900 border-neutral-700'}`}>{w.status === 'paid' ? 'Paid' : w.status === 'pending' ? 'Pending' : 'Rejected'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>}
        {!isAccountRestricted && !isImpersonating && <section className="mx-auto mb-8 max-w-7xl px-4"><div className="rounded-2xl border border-red-900/60 bg-red-950/10 p-5"><h3 className="text-sm font-bold text-red-300">Delete artist account</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-400">Deleting your account permanently removes your profile, release and video submissions, payout requests and support chat history. You will lose access immediately. Any unpaid royalties or active distribution obligations must be discussed with STB Academy before deletion.</p><button type="button" onClick={async()=>{if(!window.confirm('Are you sure? Your artist account, submissions, payout requests and chat history will be permanently deleted. This cannot be undone.'))return;if(!window.confirm('Final confirmation: permanently delete this STB Academy artist account?'))return;try{await api.deleteAccount();logout();}catch(err:any){alert(err.message||'Account deletion failed.');}}} className="mt-3 rounded-xl border border-red-800 bg-red-950/40 px-4 py-2.5 text-xs font-bold text-red-200">Permanently delete my account</button></div></section>}
      </main>

      {!isAccountRestricted && contractAccepted && contractText && <div className="mx-auto max-w-7xl px-4 pb-5"><button onClick={downloadArtistContract} className="rounded-lg border border-orange-800 px-3 py-2 text-xs font-semibold text-orange-300">Download signed artist agreement (.txt)</button></div>}
      {!isAccountRestricted && !contractAccepted && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md"><div className="w-full max-w-3xl max-h-[94vh] overflow-hidden rounded-2xl border border-orange-700/60 bg-neutral-950 shadow-2xl"><div className="border-b border-neutral-800 p-5"><p className="text-[10px] font-black uppercase tracking-[.25em] text-orange-400">Required before distribution</p><h2 className="mt-2 text-xl font-black text-white">STB Academy Artist Distribution Agreement</h2><p className="mt-1 text-xs text-neutral-400">Free distribution for independent artists and labels · No upfront or subscription fees · 80% Artist / 20% STB Academy administration · 100% Artist master ownership</p></div><div className="max-h-[54vh] overflow-y-auto whitespace-pre-wrap p-5 text-xs leading-6 text-neutral-300">{contractText || 'Loading agreement…'}</div><div className="space-y-3 border-t border-neutral-800 p-5"><label className="flex items-start gap-3 text-xs leading-5 text-neutral-300"><input type="checkbox" checked={contractChecked} onChange={e=>setContractChecked(e.target.checked)} className="mt-1 accent-orange-500"/><span>I have read and agree to the STB Academy Artist Distribution Agreement, including the 80/20 STB Academy administration royalty split, 100% artist master ownership, distribution authority and payout terms. I authorise STB Academy to act as my non-exclusive music distributor and release administrator for accepted submissions.</span></label>{contractError&&<p className="text-xs text-red-400">{contractError}</p>}<div className="flex flex-wrap gap-2"><button onClick={downloadArtistContract} disabled={!contractText} className="rounded-lg border border-neutral-700 px-4 py-2.5 text-xs font-bold text-neutral-200">Download agreement</button><button onClick={()=>void signArtistContract()} disabled={!contractChecked||contractBusy||!contractText} className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{contractBusy?'Saving signature…':'Agree & Sign to Continue'}</button></div><p className="text-[10px] text-neutral-500">A generated electronic signature and timestamp will be saved to your dashboard and the STB Academy administrator record. Do not sign if you do not agree.</p></div></div></div>}

      {!isAccountRestricted && !isImpersonating && <RoyaltyWithdrawalModal
        isOpen={withdrawalOpen}
        summary={royaltySummary}
        onClose={() => setWithdrawalOpen(false)}
        onProfileLinked={()=>void refreshUser()}
        onSubmitted={(summary, withdrawal) => {
          setRoyaltySummary(summary);
          setWithdrawals(prev => [withdrawal, ...prev]);
          void refreshUser();
        }}
      />}
      </div>
    </div>
  );
};
