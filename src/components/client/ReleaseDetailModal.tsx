import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Disc,
  Clock,
  Calendar,
  Layers,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Music,
  CheckCircle2,
  AlertTriangle,
  Download,
  XCircle,
  RotateCcw,
  FileText
} from 'lucide-react';
import { Release, ReleaseStatus } from '../../types';
import { AudioPlayer } from '../common/AudioPlayer';
import { api } from '../../services/api';

interface ReleaseDetailModalProps {
  release: Release | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenSharePage: (refNumber: string) => void;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  allowClientActions?: boolean;
  onStatusUpdated?: (updated: Release) => void;
}

export const ReleaseDetailModal: React.FC<ReleaseDetailModalProps> = ({
  release,
  isOpen,
  onClose,
  onOpenSharePage,
  isAdmin = false,
  isSuperAdmin = false,
  allowClientActions = true,
  onStatusUpdated,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);

  // Asset download states
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Admin action states
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Deny modal / reason input state
  const [showDenyPrompt, setShowDenyPrompt] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  
  // Corrections prompt state
  const [showCorrectionsPrompt, setShowCorrectionsPrompt] = useState(false);
  const [correctionsNote, setCorrectionsNote] = useState('');

  // Approval note state
  const [approvalNote, setApprovalNote] = useState('');

  // ASSET DOWNLOAD HANDLER (SECURE SIGNED URL)
  const handleDownload = async (
    assetType: 'artwork' | 'track' | 'document',
    assetId?: string,
    fallbackFilename?: string
  ) => {
    if (!release) return;
    try {
      const key = assetId || assetType;
      setDownloadingAsset(key);
      setDownloadError(null);
      await api.downloadAsset(release.id, assetType, assetId, fallbackFilename);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadError(err.message || 'Download failed. Please try again.');
      setTimeout(() => setDownloadError(null), 6000);
    } finally {
      setDownloadingAsset(null);
    }
  };

  if (!isOpen || !release) return null;

  const handleCopyLink = () => {
    const url = `${window.location.origin}?ref=${release.refNumber}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: ReleaseStatus) => {
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

  // ADMIN ACTION: APPROVE RELEASE
  const handleApprove = async () => {
    try {
      setActionLoading(true);
      setStatusMessage(null);
      const res = await api.approveRelease(release.id, approvalNote.trim() || undefined);
      setStatusMessage(`Release ${release.refNumber} has been APPROVED!`);
      if (onStatusUpdated) onStatusUpdated(res.release);
    } catch (err: any) {
      alert(err.message || 'Failed to approve release.');
    } finally {
      setActionLoading(false);
    }
  };

  // ADMIN ACTION: UPDATE WORKFLOW MILESTONE
  const handleWorkflowStatus = async (status: 'Delivered' | 'In Distribution' | 'Rejected') => {
    try {
      setActionLoading(true);
      setStatusMessage(null);
      const res = await api.updateReleaseWorkflowStatus(release.id, status, approvalNote.trim() || undefined);
      setStatusMessage(`Release ${release.refNumber} status updated to ${status}.`);
      if (onStatusUpdated) onStatusUpdated(res.release);
    } catch (err: any) {
      alert(err.message || `Could not update release status to ${status}.`);
    } finally {
      setActionLoading(false);
    }
  };

  // ADMIN ACTION: DENY RELEASE
  const handleDenySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!denyReason.trim()) {
      alert('Please specify the reason for denying this release.');
      return;
    }

    try {
      setActionLoading(true);
      setStatusMessage(null);
      const res = await api.denyRelease(release.id, denyReason.trim());
      setStatusMessage(`Release ${release.refNumber} has been DENIED.`);
      setShowDenyPrompt(false);
      if (onStatusUpdated) onStatusUpdated(res.release);
    } catch (err: any) {
      alert(err.message || 'Failed to deny release.');
    } finally {
      setActionLoading(false);
    }
  };

  // ADMIN ACTION: REQUEST CORRECTIONS
  const handleCorrectionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionsNote.trim()) {
      alert('Please specify the corrections required from the client.');
      return;
    }

    try {
      setActionLoading(true);
      setStatusMessage(null);
      const res = await api.requestCorrections(release.id, correctionsNote.trim());
      setStatusMessage(`Corrections requested for ${release.refNumber}. Client notified.`);
      setShowCorrectionsPrompt(false);
      if (onStatusUpdated) onStatusUpdated(res.release);
    } catch (err: any) {
      alert(err.message || 'Failed to request corrections.');
    } finally {
      setActionLoading(false);
    }
  };

  const activeTrack = release.tracks[selectedTrackIndex] || release.tracks[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/40">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-neutral-400 uppercase">
              Reference:
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700 text-xs font-mono font-bold text-orange-400">
              {release.refNumber}
            </span>
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border ${getStatusColor(release.status)}`}>
              {release.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 text-xs"
              title="Copy Reference Link"
            >
              {copied ? <Check className="w-4 h-4 text-orange-400" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Link'}</span>
            </button>

            {release.allowPublicShare && release.status !== 'Denied' && (
              <button
                onClick={() => onOpenSharePage(release.refNumber)}
                className="p-2 text-orange-400 hover:text-orange-300 rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1 text-xs font-semibold"
                title="Open Public Showcase"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Showcase</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[78vh] overflow-y-auto space-y-6">
          
          {statusMessage && (
            <div className="p-3 bg-neutral-900 border border-neutral-700 rounded-xl flex items-center justify-between text-xs text-white">
              <span className="font-semibold">{statusMessage}</span>
              <button onClick={() => setStatusMessage(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
          )}

          {downloadError && (
            <div className="p-3 bg-orange-950/80 border border-orange-800 rounded-xl flex items-center justify-between text-xs text-orange-300 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                <span>{downloadError}</span>
              </div>
              <button onClick={() => setDownloadError(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
          )}

          {/* Top Section: Real Cover Artwork & Primary Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            
            {/* Cover Artwork with Direct Download */}
            <div className="md:col-span-4 flex flex-col items-center">
              <div className="relative group rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl w-full max-w-[260px] aspect-square bg-neutral-900 flex items-center justify-center">
                <img
                  src={release.artworkUrl}
                  alt={release.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
                  }}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="mt-3 text-center space-y-2 w-full">
                <span className="text-[11px] font-mono text-neutral-400 block">
                  {release.artworkDimensions ? `${release.artworkDimensions.width}×${release.artworkDimensions.height}px` : 'Square JPG/PNG'}
                </span>
                
                {/* Download Artwork Button */}
                <button
                  type="button"
                  onClick={() => handleDownload('artwork', undefined, release.artworkFilename || `${release.refNumber}-cover.jpg`)}
                  disabled={downloadingAsset === 'artwork'}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-xl transition-colors w-full cursor-pointer disabled:opacity-50"
                  title="Download verified square master cover artwork"
                >
                  {downloadingAsset === 'artwork' ? (
                    <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-orange-500" />
                  )}
                  <span>{downloadingAsset === 'artwork' ? 'Securing Artwork...' : 'Download Cover Artwork'}</span>
                </button>

                {/* Download QC Cue & Metadata Document Button */}
                <button
                  type="button"
                  onClick={() => handleDownload('document', undefined, `${release.refNumber}-QC-Metadata-Sheet.txt`)}
                  disabled={downloadingAsset === 'document'}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-xl transition-colors w-full cursor-pointer disabled:opacity-50"
                  title="Download official STB Academy QC verification & metadata cue sheet document"
                >
                  {downloadingAsset === 'document' ? (
                    <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-orange-500" />
                  )}
                  <span>{downloadingAsset === 'document' ? 'Preparing Document...' : 'Download QC Document'}</span>
                </button>
              </div>
            </div>

            {/* Complete Release Metadata */}
            <div className="md:col-span-8 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 mb-1">
                  <span>{release.releaseType}</span>
                  <span>·</span>
                  <span className="text-orange-400 font-semibold">{release.genre}</span>
                  {release.subGenre && <span>({release.subGenre})</span>}
                  {release.language && <span>· {release.language}</span>}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white font-['Space_Grotesk'] leading-tight">
                  {release.title}
                </h1>
                <p className="text-base text-neutral-300 font-medium mt-1">
                  {release.primaryArtists.join(', ')}
                  {release.featuredArtists && release.featuredArtists.length > 0 && (
                    <span className="text-neutral-400 font-normal"> (feat. {release.featuredArtists.join(', ')})</span>
                  )}
                </p>

                {/* Complete artist profile and social links — ordered and shown in full */}
                {(() => {
                  const profiles = [
                    ...(release.primaryArtistProfiles || []).map(profile => ({ ...profile, displayRole: 'Primary artist' })),
                    ...(release.featuredArtistProfiles || []).map(profile => ({ ...profile, displayRole: 'Featured artist' })),
                  ];
                  const platformName = (url: string, index: number) => {
                    try {
                      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
                      const platforms: Array<[string, string]> = [['instagram.com','Instagram'],['spotify.com','Spotify'],['music.apple.com','Apple Music'],['tiktok.com','TikTok'],['facebook.com','Facebook'],['youtube.com','YouTube'],['youtu.be','YouTube'],['x.com','X'],['twitter.com','X'],['soundcloud.com','SoundCloud'],['audiomack.com','Audiomack']];
                      return platforms.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] || `Social link ${index + 1}`;
                    } catch { return `Social link ${index + 1}`; }
                  };
                  return profiles.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Artist links — full URLs in submission order</p>
                      {profiles.map((profile, index) => {
                        const links = [
                          ...(profile.socialMediaLinks || []).map((url, linkIndex) => ({ label: platformName(url, linkIndex), url })),
                          ...(profile.spotifyProfileUrl ? [{ label: 'Spotify', url: profile.spotifyProfileUrl }] : []),
                          ...(profile.appleMusicProfileUrl ? [{ label: 'Apple Music', url: profile.appleMusicProfileUrl }] : []),
                        ];
                        return <div key={`${profile.name}-${index}`} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-[11px]">
                          <p className="mb-1 font-semibold text-neutral-200">{profile.displayRole}: {profile.name}</p>
                          {links.length ? links.map((link, linkIndex) => <div key={`${link.label}-${linkIndex}`} className="break-all leading-5">
                            <span className="text-neutral-400">{link.label}: </span>
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-orange-300 underline underline-offset-2">{link.url}</a>
                          </div>) : <p className="text-neutral-500">No profile links supplied.</p>}
                          {(profile.spotifyProfileCreateRequested || profile.appleMusicProfileCreateRequested) && <p className="mt-1 text-amber-300">New profile creation requested</p>}
                        </div>;
                      })}
                    </div>
                  ) : null;
                })()}

              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-neutral-900/60 border border-neutral-800/80 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase block">Client / Label</span>
                  <span className="font-semibold text-neutral-200 truncate block">{release.artistLabelName}</span>
                  {release.labelName && <span className="text-[10px] text-neutral-300 block">Release label: {release.labelName}</span>}
                  <span className="text-[10px] text-neutral-500 font-mono truncate block">{release.userEmail}</span>
                </div>

                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase block">Target Release Date</span>
                  <span className="font-mono text-neutral-200">{release.targetReleaseDate}</span>
                </div>

                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase block">Submission Date</span>
                  <span className="font-mono text-neutral-400">
                    {new Date(release.submittedAt).toLocaleDateString()}
                  </span>
                </div>

                {release.composers && release.composers.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase block">Composer(s)</span>
                    <span className="text-neutral-300">{release.composers.join(', ')}</span>
                  </div>
                )}

                {release.producers && release.producers.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase block">Producer(s)</span>
                    <span className="text-neutral-300">{release.producers.join(', ')}</span>
                  </div>
                )}
                {release.publishers && release.publishers.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase block">Publisher(s)</span>
                    <span className="text-neutral-300">{release.publishers.join(', ')}</span>
                  </div>
                )}
                {release.lyricsLanguage && <div><span className="text-[10px] font-mono text-neutral-500 uppercase block">Lyrics language</span><span className="text-neutral-300">{release.lyricsLanguage}</span></div>}
                {release.version && <div><span className="text-[10px] font-mono text-neutral-500 uppercase block">Version</span><span className="text-neutral-300">{release.version}</span></div>}
                {release.previewStart !== undefined && <div><span className="text-[10px] font-mono text-neutral-500 uppercase block">Preview start</span><span className="text-neutral-300">{Math.floor(release.previewStart / 60)}:{String(release.previewStart % 60).padStart(2,'0')}</span></div>}
                {release.dspSelections && <div className="col-span-2 sm:col-span-3"><span className="text-[10px] font-mono text-neutral-500 uppercase block">Requested DSPs (selected order)</span><span className="text-neutral-300">{release.dspSelections.length ? release.dspSelections.join(' · ') : 'None selected'}</span></div>}

                {release.previouslyReleased && (
                  <div className="col-span-2 sm:col-span-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                    <span className="text-[10px] font-mono text-amber-300 uppercase block">Previously released — original identifiers</span>
                    <div className="mt-1 grid gap-2 sm:grid-cols-3 text-xs text-neutral-300">
                      <span>Original release date: {release.originalReleaseDate || 'Not supplied'}</span>
                      <span>ISRC: {release.previousISRC || 'Not supplied'}</span>
                      <span>UPC: {release.upc || release.previousUPC || 'Pending'}</span><span>Assigned ISRC: {release.isrc || release.tracks?.map(t=>t.isrc).filter(Boolean).join(', ') || release.previousISRC || 'Pending'}</span>
                    </div>
                    {release.previousReleaseDetails && <p className="mt-2 text-xs text-neutral-400">Previous release details: {release.previousReleaseDetails}</p>}
                  </div>
                )}

                {release.approvalDate && (
                  <div>
                    <span className="text-[10px] font-mono text-orange-400 uppercase block">Approval Date</span>
                    <span className="font-mono text-neutral-200">{new Date(release.approvalDate).toLocaleString()}</span>
                  </div>
                )}

                <div className="col-span-2 sm:col-span-3 text-[11px] font-mono text-neutral-400 pt-1 border-t border-neutral-800">
                  <span>{release.cLine} · {release.pLine}</span>
                </div>
              </div>

              {/* Status Specific Notices */}
              {release.status === 'Denied' && release.denialReason && (
                <div className="p-4 rounded-xl border bg-orange-950/40 border-orange-800 text-orange-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-['Space_Grotesk'] text-orange-400">
                    <XCircle className="w-4 h-4" />
                    <span>Release Denied - Reason:</span>
                  </div>
                  <p className="leading-relaxed pl-5">{release.denialReason}</p>
                </div>
              )}

              {release.status === 'Corrections Required' && release.adminNotes && (
                <div className="p-4 rounded-xl border bg-orange-950/40 border-orange-800 text-orange-300 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-['Space_Grotesk'] text-orange-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Administrator Feedback & Corrections Required:</span>
                  </div>
                  <p className="leading-relaxed pl-5">{release.adminNotes}</p>
                </div>
              )}

              {release.clientNotes && (
                <div className="p-3 bg-neutral-900/40 border border-neutral-800/60 rounded-xl text-xs text-neutral-400 space-y-1">
                  <span className="font-semibold text-neutral-300">Client Notes:</span>
                  <p className="italic">"{release.clientNotes}"</p>
                </div>
              )}
              {release.lyrics && (
                <div className="p-3 bg-neutral-900/40 border border-neutral-800/60 rounded-xl text-xs text-neutral-300 space-y-1">
                  <span className="font-semibold text-neutral-200">Submitted Lyrics:</span>
                  <p className="whitespace-pre-wrap leading-relaxed">{release.lyrics}</p>
                </div>
              )}
            </div>

          </div>

          {/* Master Audio Tracks Section */}
          <div className="pt-4 border-t border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white font-['Space_Grotesk'] flex items-center gap-2">
                <Music className="w-4 h-4 text-orange-500" />
                <span>Uploaded Lossless Master Tracks ({release.tracks.length})</span>
              </h3>
              <span className="text-xs font-mono text-neutral-400">Audio Preview & Downloads</span>
            </div>

            {/* In-browser Audio Player for selected track */}
            {activeTrack && (
              <AudioPlayer
                src={activeTrack.fileUrl}
                title={activeTrack.title}
                artist={activeTrack.primaryArtists?.length ? `${activeTrack.primaryArtists.join(', ')}${activeTrack.featuredArtists?.length ? ` feat. ${activeTrack.featuredArtists.join(', ')}` : ''}` : release.primaryArtists.join(', ')}
                version={activeTrack.version}
              />
            )}

            {/* Tracklist table with individual lossless download buttons */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl divide-y divide-neutral-800/80 overflow-hidden">
              {release.tracks.map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTrackIndex(idx)}
                  className={`flex items-center justify-between p-3.5 cursor-pointer transition-colors ${
                    selectedTrackIndex === idx ? 'bg-neutral-800/80 text-white' : 'hover:bg-neutral-900/60 text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-md bg-neutral-950 border border-neutral-800 text-neutral-400 font-mono text-xs flex items-center justify-center">
                      {t.trackNumber}
                    </span>
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-2">
                        <span>{t.title}</span>
                        {t.explicit && (
                          <span className="text-[9px] px-1 bg-orange-950 text-orange-400 border border-orange-800 rounded">
                            EXPLICIT
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono">{t.version || 'Original Mix'} · {t.filename}</span>
                      {(t.countryOfRecording || t.genre || t.language || t.primaryArtists?.length || t.featuredArtists?.length) && <div className="mt-1 space-y-0.5 text-[10px] text-neutral-500">{t.primaryArtists?.length ? <p>Artists: {t.primaryArtists.join(', ')}{t.featuredArtists?.length ? ` feat. ${t.featuredArtists.join(', ')}` : ''}</p> : null}{t.artistProfiles?.length ? <p>Artist profile details: {t.artistProfiles.map(a=>`${a.name} (${a.role==='featured'?'featured':'primary'}; ${a.spotifyProfileCreateRequested||a.appleMusicProfileCreateRequested?'new profiles requested':`Spotify: ${a.spotifyProfileUrl||'—'}, Apple Music: ${a.appleMusicProfileUrl||'—'}`})`).join('; ')}</p> : null}<p>{[t.genre, t.subGenre, t.language, t.countryOfRecording ? `Recorded in ${t.countryOfRecording}` : ''].filter(Boolean).join(' · ')}</p>{t.lyricsLanguage ? <p>Lyrics language: {t.lyricsLanguage}</p> : null}{t.composers?.length ? <p>Composers: {t.composers.join(', ')}</p> : null}{t.producers?.length ? <p>Producers: {t.producers.join(', ')}</p> : null}{t.publishers?.length ? <p>Publishers: {t.publishers.join(', ')}</p> : null}{t.previewStart ? <p>Preview starts at: {t.previewStart}s</p> : null}{t.previouslyReleased ? <p>Previously released: {t.originalReleaseDate || 'Yes'} · ISRC {t.previousISRC || '—'} · UPC {t.previousUPC || '—'}</p> : null}{t.lyrics ? <p className="whitespace-pre-wrap">Lyrics: {t.lyrics}</p> : null}{t.digitalReleaseDate ? <p>Digital release date: {t.digitalReleaseDate}</p> : null}{t.instrumental ? <p>Instrumental: Yes</p> : null}{t.coverSong ? <p>Cover song: Yes</p> : null}{t.label ? <p>Track label: {t.label}</p> : null}{t.cLine ? <p>CLine: {t.cLine}</p> : null}{t.pLine ? <p>PLine: {t.pLine}</p> : null}{t.parentalAdvisory ? <p>Parental advisory: {t.parentalAdvisory}</p> : null}{t.clean ? <p>Clean version: Yes</p> : null}{t.requestContentId ? <p>Content ID requested: Yes</p> : null}{t.publishing ? <p>Publishing: Yes</p> : null}{t.additionalInfo ? <p>Additional information: {t.additionalInfo}</p> : null}{t.writers?.length ? <p>Writers: {t.writers.map(c=>`${c.name} (${c.role})`).join(', ')}</p> : null}{t.trackPublishers?.length ? <p>Track publishers: {t.trackPublishers.map(c=>`${c.name} (${c.role})`).join(', ')}</p> : null}{t.trackProducers?.length ? <p>Track producers: {t.trackProducers.map(c=>`${c.name} (${c.role})`).join(', ')}</p> : null}{t.additionalPerformers?.length ? <p>Additional performers: {t.additionalPerformers.map(c=>`${c.name} (${c.role})`).join(', ')}</p> : null}{t.additionalContributors?.length ? <p>Additional contributors: {t.additionalContributors.map(c=>`${c.name} (${c.role})`).join(', ')}</p> : null}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {/* Individual Master Download Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload('track', t.id, t.filename || `${release.refNumber}-${t.trackNumber}-${t.title}.mp3`);
                      }}
                      disabled={downloadingAsset === t.id}
                      className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-neutral-200 hover:text-white text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      title="Download lossless master audio"
                    >
                      {downloadingAsset === t.id ? (
                        <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3 h-3 text-orange-500" />
                      )}
                      <span>{downloadingAsset === t.id ? 'Securing...' : 'Download Master'}</span>
                    </button>

                    <button
                      type="button"
                      className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] rounded"
                    >
                      {selectedTrackIndex === idx ? 'Playing' : 'Listen'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!isAdmin && (
            <div className="pt-5 border-t border-neutral-800 space-y-3">
              <div>
                <h4 className="text-sm font-bold text-white">Takedown Request</h4>
                <p className="text-xs text-neutral-500 mt-1">You may request removal of this release. A request made within 30 days of the release date carries a $2.50 processing fee.</p>
              </div>
              {!isAdmin && allowClientActions && ((Date.now() - new Date(release.submittedAt).getTime()) <= 12*60*60*1000 || release.status === 'Corrections Required') && <form className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const payload:any={title:(form.elements.namedItem('editTitle') as HTMLInputElement).value,genre:(form.elements.namedItem('editGenre') as HTMLInputElement).value,subGenre:(form.elements.namedItem('editSubGenre') as HTMLInputElement).value,language:(form.elements.namedItem('editLanguage') as HTMLInputElement).value,lyricsLanguage:(form.elements.namedItem('editLyricsLanguage') as HTMLInputElement).value,targetReleaseDate:(form.elements.namedItem('editDate') as HTMLInputElement).value,lyrics:(form.elements.namedItem('editLyrics') as HTMLTextAreaElement).value,clientNotes:(form.elements.namedItem('editNotes') as HTMLTextAreaElement).value};try{setActionLoading(true);const artworkFile=(form.elements.namedItem('editArtwork') as HTMLInputElement).files?.[0];if(artworkFile){const art=await api.uploadArtwork(artworkFile);payload.artworkUrl=art.fileUrl;payload.artworkFilename=art.filename;payload.storedArtworkFilename=art.storedFilename;payload.artworkDimensions=art.dimensions;}const audioFiles=Array.from((form.elements.namedItem('editTracks') as HTMLInputElement).files||[]);if(audioFiles.length){const tracks=[] as any[];for(let i=0;i<audioFiles.length;i++){const audio=await api.uploadAudio(audioFiles[i]);tracks.push({id:`track-${Date.now()}-${i}`,title:release.tracks[i]?.title||audioFiles[i].name.replace(/\.mp3$/i,''),filename:audio.filename,storedFilename:audio.storedFilename,fileUrl:audio.fileUrl,fileSize:audio.fileSize,version:release.version,explicit:release.tracks[i]?.explicit,trackNumber:i+1});}payload.tracks=tracks;}const result=await api.updateClientRelease(release.id,payload);setStatusMessage('Your submission was updated.');if(onStatusUpdated)onStatusUpdated(result.release);}catch(err:any){alert(err.message||'Could not update your submission.');}finally{setActionLoading(false);}}}><h4 className="text-xs font-bold text-white">Edit submission</h4><p className="text-[10px] text-neutral-500">Editing is available for 12 hours after submission, and again whenever corrections are requested.</p><div className="grid gap-2 sm:grid-cols-2"><input name="editTitle" defaultValue={release.title} required className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Release title"/><input name="editGenre" defaultValue={release.genre} required className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Genre"/><input name="editSubGenre" defaultValue={release.subGenre||''} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Sub-genre"/><input name="editLanguage" defaultValue={release.language||''} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Language"/><input name="editLyricsLanguage" defaultValue={release.lyricsLanguage||''} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Lyrics language"/><input name="editDate" type="date" defaultValue={release.targetReleaseDate} required className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"/></div><textarea name="editLyrics" defaultValue={release.lyrics||''} rows={3} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Lyrics"/><textarea name="editNotes" defaultValue={release.clientNotes||''} rows={2} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white" placeholder="Notes to STB Academy"/><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-neutral-400">Replace cover artwork<input name="editArtwork" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" className="mt-1 block w-full text-[10px] text-neutral-300"/></label><label className="text-[10px] text-neutral-400">Replace MP3 master(s)<input name="editTracks" type="file" multiple accept=".mp3,audio/mpeg" className="mt-1 block w-full text-[10px] text-neutral-300"/></label></div><button disabled={actionLoading} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Save submission changes</button></form>}
              {!isAdmin && allowClientActions && <button type="button" disabled={actionLoading} onClick={async()=>{if(!window.confirm(`Delete your submission ${release.title}? This cannot be undone.`))return;try{setActionLoading(true);await api.deleteClientRelease(release.id);window.dispatchEvent(new CustomEvent('stbacademy:release-deleted',{detail:{id:release.id}}));onClose();}catch(err:any){alert(err.message||'Could not delete submission.');}finally{setActionLoading(false);}}} className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-2 text-xs font-bold text-red-300">Delete this submission</button>}
              {release.status === 'Takedown Requested' || release.status === 'Takedown Processing' || release.status === 'Takedown Completed' ? (
                <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-xl text-xs text-amber-300">Takedown status: <strong>{release.status}</strong></div>
              ) : (
                <button type="button" disabled={actionLoading || release.status === 'Denied'} onClick={async () => {
                  if (!window.confirm('Submit a takedown request for this release?')) return;
                  try { setActionLoading(true); const res = await api.requestTakedown(release.id); setStatusMessage('Takedown request submitted.'); if (onStatusUpdated) onStatusUpdated(res.release); } catch (err:any) { alert(err.message || 'Could not submit takedown request.'); } finally { setActionLoading(false); }
                }} className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-orange-900/60 text-orange-300 rounded-xl text-xs font-bold">Request Takedown</button>
              )}
            </div>
          )}

          {/* ADMIN APPROVE / DENY / CORRECTIONS WORKFLOW CONTROLS */}
          {isAdmin && (
            <div className="pt-6 border-t border-neutral-800 bg-neutral-900/50 -mx-6 -mb-6 p-6 rounded-b-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-orange-500" />
                  <h4 className="text-sm font-bold text-white font-['Space_Grotesk']">
                    Administrator Review & Decisions
                  </h4>
                </div>
                <span className="text-[10px] font-mono bg-neutral-950 text-neutral-400 border border-neutral-800 px-2 py-0.5 rounded">
                  ADMIN ONLY
                </span>
              </div>

              {isSuperAdmin && <div className="rounded-xl border border-orange-800/50 bg-neutral-950 p-4 space-y-2"><h5 className="text-xs font-bold text-orange-200">Cover artwork management</h5><button type="button" disabled={actionLoading} onClick={async()=>{if(!window.confirm('Remove the cover artwork from this submission?'))return;try{setActionLoading(true);const result=await api.removeReleaseArtwork(release.id);setStatusMessage('Cover artwork removed.');if(onStatusUpdated)onStatusUpdated(result.release);}catch(err:any){alert(err.message||'Could not remove cover artwork.');}finally{setActionLoading(false);}}} className="mr-2 rounded-lg border border-red-800 px-3 py-2 text-[10px] font-bold text-red-300">Remove artwork</button><input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" disabled={actionLoading} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setActionLoading(true);const result=await api.replaceReleaseArtwork(release.id,file);setStatusMessage('Cover artwork replaced.');if(onStatusUpdated)onStatusUpdated(result.release);}catch(err:any){alert(err.message||'Could not replace cover artwork.');}finally{setActionLoading(false);e.currentTarget.value='';}}} className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-600 file:px-3 file:py-2 file:text-white"/></div>}
              {isSuperAdmin && <div className="rounded-xl border border-orange-800/50 bg-neutral-950 p-4 space-y-3"><div><h5 className="text-xs font-bold text-orange-200">Release identifiers (ISRC / UPC)</h5><p className="mt-1 text-[10px] text-neutral-500">Assign or correct the official codes for this release. These values will also appear in the artist's release details.</p></div><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-neutral-400">ISRC<input id="stb-release-isrc" defaultValue={release.isrc || ''} placeholder="12-character ISRC" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"/></label><label className="text-[10px] text-neutral-400">UPC / EAN<input id="stb-release-upc" defaultValue={release.upc || ''} placeholder="12 or 13 digits" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"/></label></div>{release.tracks.length>1&&<div className="space-y-2">{release.tracks.map(track=><label key={track.id} className="block text-[10px] text-neutral-400">Track {track.trackNumber} — {track.title} ISRC<input data-stb-track-isrc data-track-id={track.id} defaultValue={track.isrc||''} placeholder="12-character ISRC" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white"/></label>)}</div>}<button type="button" disabled={actionLoading} onClick={async()=>{const isrc=(document.getElementById('stb-release-isrc') as HTMLInputElement)?.value||'';const upc=(document.getElementById('stb-release-upc') as HTMLInputElement)?.value||'';try{setActionLoading(true);const tracks=Array.from(document.querySelectorAll<HTMLInputElement>('[data-stb-track-isrc]')).map(input=>({id:input.dataset.trackId||'',isrc:input.value}));const result=await api.updateReleaseCodes(release.id,{isrc,upc,tracks});setStatusMessage('ISRC and UPC saved.');if(onStatusUpdated)onStatusUpdated(result.release);}catch(err:any){alert(err.message||'Could not save release identifiers.');}finally{setActionLoading(false);}}} className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Save ISRC / UPC</button></div>}
              {!isSuperAdmin && (release.isrc || release.upc) && <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"><strong className="text-white">Release identifiers</strong><div className="mt-1 font-mono text-[10px]">ISRC: {release.isrc || release.tracks?.map(t=>t.isrc).filter(Boolean).join(', ') || release.previousISRC || 'Pending'} · UPC: {release.upc || release.previousUPC || 'Pending'}</div></div>}

              {/* Admin Asset Downloads Hub */}
              <div className="p-3.5 bg-neutral-950/90 border border-neutral-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-mono text-neutral-300 text-xs flex items-center gap-2 font-bold">
                  <Download className="w-4 h-4 text-orange-500" />
                  <span>Admin Asset Downloads:</span>
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleDownload('artwork', undefined, release.artworkFilename || `${release.refNumber}-artwork.jpg`)}
                    disabled={downloadingAsset === 'artwork'}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-neutral-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Download Cover Artwork</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const activeTrack = release.tracks[selectedTrackIndex] || release.tracks[0];
                      if (activeTrack) {
                        handleDownload('track', activeTrack.id, activeTrack.filename);
                      }
                    }}
                    disabled={!!downloadingAsset && downloadingAsset.startsWith('trk_')}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-neutral-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Download Audio (Track #{release.tracks[selectedTrackIndex]?.trackNumber || 1})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload('document', undefined, `${release.refNumber}-QC-Metadata-Sheet.txt`)}
                    disabled={downloadingAsset === 'document'}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 text-neutral-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5 text-orange-400" />
                    <span>Download QC Document</span>
                  </button>
                </div>
              </div>

              {/* Takedown controls */}
              {isSuperAdmin && ['Takedown Requested','Takedown Processing'].includes(release.status) && (
                <div className="p-3.5 bg-amber-950/20 border border-amber-900/50 rounded-xl flex flex-wrap items-center gap-2">
                  <span className="text-xs text-amber-300 mr-auto">Takedown requested by client. Update the processing status here.</span>
                  {release.status === 'Takedown Requested' && <button type="button" disabled={actionLoading} onClick={async()=>{ try { setActionLoading(true); const res=await api.processTakedown(release.id,'Takedown Processing','Takedown request is being processed.'); setStatusMessage('Takedown is now processing.'); if(onStatusUpdated) onStatusUpdated(res.release); } catch(err:any){alert(err.message||'Could not update takedown.');} finally{setActionLoading(false);} }} className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold">Mark Processing</button>}
                  <button type="button" disabled={actionLoading} onClick={async()=>{ try { setActionLoading(true); const res=await api.processTakedown(release.id,'Takedown Completed','Takedown marked completed by administration.'); setStatusMessage('Takedown marked completed.'); if(onStatusUpdated) onStatusUpdated(res.release); } catch(err:any){alert(err.message||'Could not complete takedown.');} finally{setActionLoading(false);} }} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold">Mark Completed</button>
                </div>
              )}

              {/* Final distribution controls are exclusively super-admin actions. */}
              {isSuperAdmin && <div className="rounded-xl border border-orange-800/50 bg-orange-950/10 p-3 space-y-3"><p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Distribution controls</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" disabled={actionLoading} onClick={()=>handleWorkflowStatus('Delivered')} className="rounded-lg bg-orange-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">Mark Delivered</button><button type="button" disabled={actionLoading} onClick={()=>handleWorkflowStatus('In Distribution')} className="rounded-lg border border-orange-700 px-3 py-2.5 text-xs font-bold text-orange-200 disabled:opacity-40">In Distribution</button><button type="button" disabled={actionLoading} onClick={()=>handleWorkflowStatus('Rejected')} className="rounded-lg border border-red-800 bg-red-950/30 px-3 py-2.5 text-xs font-bold text-red-300 disabled:opacity-40">Final Rejected</button></div><p className="text-[10px] text-neutral-500">Only the super administrator can assign final delivery states or attach pre-save links.</p></div>}

              {/* Primary Decision Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Once the super admin sets a final distribution milestone, normal-admin decisions lock. */}
                {/* APPROVE RELEASE BUTTON */}
                {(release.status === 'Delivered' || release.status === 'In Distribution') && !isSuperAdmin ? <button type="button" disabled className="py-3 px-4 bg-neutral-800 border border-neutral-700 text-neutral-500 font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-not-allowed opacity-60">APPROVAL LOCKED BY SUPER ADMIN</button> : release.status === 'Approved' ? <div className="flex items-center justify-center rounded-xl border border-orange-800/50 bg-orange-950/20 px-3 py-3 text-center text-xs font-bold text-orange-200">Approved · awaiting distribution decision</div> : <button type="button" disabled={actionLoading} onClick={handleApprove} className="py-3 px-4 bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-800 disabled:border disabled:border-neutral-700 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"><CheckCircle2 className="w-4 h-4"/><span>APPROVE RELEASE</span></button>}

                {/* DENY RELEASE BUTTON */}
                <button
                  type="button"
                  disabled={actionLoading || release.status === 'Denied' || release.status === 'Completed' || (!isSuperAdmin && ['Delivered','In Distribution'].includes(release.status))}
                  onClick={() => {
                    setShowDenyPrompt(true);
                    setShowCorrectionsPrompt(false);
                  }}
                  className="py-3 px-4 bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-800 disabled:border disabled:border-neutral-700 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-orange-950 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>DENY RELEASE</span>
                </button>

                {/* REQUEST CORRECTIONS BUTTON */}
                <button
                  type="button"
                  disabled={actionLoading || release.status === 'Completed' || (!isSuperAdmin && ['Delivered','In Distribution'].includes(release.status))}
                  onClick={() => {
                    setShowCorrectionsPrompt(true);
                    setShowDenyPrompt(false);
                  }}
                  className="py-3 px-4 bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-800 disabled:border disabled:border-neutral-700 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-orange-950 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>CORRECTIONS REQUIRED</span>
                </button>
              </div>

              {!isSuperAdmin && ['Delivered','In Distribution'].includes(release.status) && <p className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-400">This release is now controlled by the super administrator. Approval, rejection and corrections actions are locked.</p>}

              {/* Optional Approval Note input */}
              {release.status !== 'Approved' && (release.status !== 'Delivered' && release.status !== 'In Distribution' || isSuperAdmin) && (
                <div className="pt-2">
                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                    Optional Approval Note to Client:
                  </label>
                  <input
                    type="text"
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="e.g. Master audio and square artwork passed STB Academy review."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-orange-600"
                  />
                </div>
              )}

              {/* DENY REASON FORM MODAL / INLINE */}
              {showDenyPrompt && (
                <form onSubmit={handleDenySubmit} className="p-4 bg-orange-950/30 border border-orange-800 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wide flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      Specify Reason for Denial (Required)
                    </span>
                    <button type="button" onClick={() => setShowDenyPrompt(false)} className="text-neutral-400 hover:text-white text-xs">Cancel</button>
                  </div>
                  <textarea
                    required
                    rows={2}
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Enter the reason why this release cannot be accepted..."
                    className="w-full bg-neutral-950 border border-orange-900/60 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDenyPrompt(false)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-lg"
                    >
                      Confirm Denial
                    </button>
                  </div>
                </form>
              )}

              {/* REQUEST CORRECTIONS FORM INLINE */}
              {showCorrectionsPrompt && (
                <form onSubmit={handleCorrectionsSubmit} className="p-4 bg-orange-950/30 border border-orange-800 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wide flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4" />
                      Specify Requested Corrections (Required)
                    </span>
                    <button type="button" onClick={() => setShowCorrectionsPrompt(false)} className="text-neutral-400 hover:text-white text-xs">Cancel</button>
                  </div>
                  <textarea
                    required
                    rows={2}
                    value={correctionsNote}
                    onChange={(e) => setCorrectionsNote(e.target.value)}
                    placeholder="Specify the exact adjustments needed from the client..."
                    className="w-full bg-neutral-950 border border-orange-900/60 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-600 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCorrectionsPrompt(false)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-lg"
                    >
                      Send Corrections Request
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
