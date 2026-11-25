import React, { useEffect, useState } from 'react';
import { AlertTriangle, Wallet, X, ExternalLink } from 'lucide-react';
import { WithdrawalRequest } from '../../types';
import { api } from '../../services/api';

interface RoyaltySummary { totalEarnings:number; pendingAmount:number; paidAmount:number; availableAmount:number }
interface Props { isOpen:boolean; summary:RoyaltySummary; payoutProfile?:any; onClose:()=>void; onSubmitted:(summary:RoyaltySummary, withdrawal:WithdrawalRequest)=>void; onProfileLinked?:()=>void }

export const RoyaltyWithdrawalModal: React.FC<Props> = ({isOpen,summary,payoutProfile,onClose,onSubmitted,onProfileLinked}) => {
  const [amount,setAmount]=useState('');
  const [email,setEmail]=useState('');
  const [mobile,setMobile]=useState('');
  const [username,setUsername]=useState('');
  const [paypalMeUrl,setPaypalMeUrl]=useState('');
  const [acknowledged,setAcknowledged]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{if(isOpen){setAmount(summary.availableAmount>0?summary.availableAmount.toFixed(2):'0.00');setEmail(payoutProfile?.email||'');setMobile(payoutProfile?.mobile||'');setUsername(payoutProfile?.username||'');setPaypalMeUrl(payoutProfile?.paypalMeUrl||'');setError('');setAcknowledged(false);}},[isOpen,summary.availableAmount,payoutProfile]);
  if(!isOpen)return null;
  const saveProfileOnly=async()=>{setError('');if(!email.trim()&&!mobile.trim()&&!username.trim()&&!paypalMeUrl.trim()){setError('Enter at least one PayPal payout identifier.');return;}try{setSaving(true);await api.savePayPalProfile({email,mobile,username,paypalMeUrl});onProfileLinked?.();alert('PayPal details saved. Your status is now Linked.');}catch(err:any){setError(err.message||'Could not save PayPal details.');}finally{setSaving(false);}};
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0)return setError('Enter a valid payment amount.');
    if(value>summary.availableAmount)return setError(`You can request up to R${summary.availableAmount.toFixed(2)}.`);
    if(!email.trim()&&!mobile.trim()&&!username.trim()&&!paypalMeUrl.trim())return setError('Enter at least one PayPal payout identifier.');
    if(!acknowledged)return setError('Confirm that your PayPal details are correct.');
    try{
      setSaving(true);
      await api.savePayPalProfile({email,mobile,username,paypalMeUrl});
      const result=await api.requestPayPalWithdrawal(value);
      onSubmitted(result.summary||summary,result.withdrawal);
      alert('Your PayPal payment request has been sent to STB Academy.');onClose();
    }catch(err:any){setError(err.message||'Could not submit your payment request.');}
    finally{setSaving(false);}
  };
  const field='w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-500';
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-5 py-4 backdrop-blur"><div><div className="flex items-center gap-2 font-bold text-white"><Wallet className="h-5 w-5 text-orange-400"/> Request PayPal Payment</div><p className="mt-1 text-[11px] text-neutral-500">Available: <strong className="text-orange-400">R{summary.availableAmount.toFixed(2)}</strong></p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-900 hover:text-white"><X className="h-5 w-5"/></button></div>
      <form onSubmit={submit} className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-3">{[['Total earnings',summary.totalEarnings],['Pending',summary.pendingAmount],['Paid',summary.paidAmount]].map(([label,val]:any)=><div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3"><span className="block text-[10px] uppercase text-neutral-500">{label}</span><strong className="text-white">R{Number(val).toFixed(2)}</strong></div>)}</div>
        <a href="https://www.paypal.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-orange-700/60 bg-orange-950/20 px-4 py-3 text-xs font-bold text-orange-200 hover:bg-orange-950/40">Open PayPal to register or sign in <ExternalLink className="h-3.5 w-3.5"/></a>
        <p className="text-xs leading-5 text-neutral-400">After signing in to PayPal in a separate tab, enter the payout details registered to your PayPal account below. STB Academy will use these details to send your payment manually.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-neutral-300">PayPal email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className={field} placeholder="name@example.com"/></label>
          <label className="space-y-1 text-xs text-neutral-300">PayPal mobile number<input value={mobile} onChange={e=>setMobile(e.target.value)} className={field} placeholder="+27..."/></label>
          <label className="space-y-1 text-xs text-neutral-300">PayPal username<input value={username} onChange={e=>setUsername(e.target.value)} className={field} placeholder="PayPal username"/></label>
          <label className="space-y-1 text-xs text-neutral-300">PayPal.Me link<input value={paypalMeUrl} onChange={e=>setPaypalMeUrl(e.target.value)} className={field} placeholder="https://paypal.me/username"/></label>
        </div>
        <label className="block space-y-1 text-xs text-neutral-300">Amount requested (ZAR)<input required type="number" min="0.01" max={summary.availableAmount} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className={field}/></label>
        <div className="rounded-xl border border-orange-800/60 bg-orange-950/20 p-4 text-[11px] leading-relaxed text-orange-100"><div className="mb-2 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4"/> Payment details and safety</div><p>Only provide your PayPal email, mobile number, username or PayPal.Me link. Never provide your PayPal password, PIN, OTP, recovery code or card security code.</p><label className="mt-3 flex cursor-pointer items-start gap-2 text-neutral-200"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} className="mt-0.5 accent-orange-500"/><span>I confirm that the PayPal details above are accurate and belong to me.</span></label></div>
        {error&&<p className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-3"><button type="button" onClick={()=>void saveProfileOnly()} disabled={saving} className="flex-1 rounded-xl border border-orange-700 px-4 py-3 text-xs font-bold text-orange-200 disabled:opacity-40">Save PayPal details only</button><button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 py-3 text-xs font-bold text-neutral-300">Cancel</button><button type="submit" disabled={saving||summary.availableAmount<=0} className="flex-1 rounded-xl bg-orange-600 py-3 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-40">{saving?'Submitting…':'Save PayPal details & request payment'}</button></div>
      </form>
    </div>
  </div>;
};
