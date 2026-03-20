
import React, { useState } from 'react';
import { GameLineups, GamePlayer } from '../types';
import { ChevronDown, ChevronUp, UserPlus, X, TrendingUp, Target, Activity, Shield } from 'lucide-react';
import * as api from '../services/sofaService';
import SofaImage from './SofaImage';

interface SoccerFieldProps {
  lineups: GameLineups;
  onSelectPlayer: (player: GamePlayer) => void;
}

const PlayerNode: React.FC<{ player: GamePlayer; onSelect: () => void }> = ({ player, onSelect }) => {
    // Cor baseada na nota (se existir)
    const ratingColor = !player.statistics?.rating ? 'bg-zinc-600' :
                        player.statistics.rating >= 7.5 ? 'bg-emerald-500' :
                        player.statistics.rating >= 7.0 ? 'bg-blue-500' :
                        player.statistics.rating >= 6.5 ? 'bg-yellow-500' : 'bg-orange-500';

    return (
        <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="flex flex-col items-center justify-center relative group transition-transform active:scale-90"
        >
            <div className="w-9 h-9 sm:w-11 sm:h-11 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full bg-zinc-900 border-2 border-white/10 shadow-xl overflow-hidden relative z-10 group-hover:border-emerald-500/50 transition-colors ring-1 ring-black/50">
                <SofaImage
                    playerId={player.id}
                    alt={player.name}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-zinc-800 hidden items-center justify-center text-zinc-500 font-black text-xs">
                    {player.shirtNumber || '?'}
                </div>
                {player.shirtNumber && (
                    <div className="absolute bottom-0 right-0 bg-black/80 backdrop-blur-sm text-white text-[8px] md:text-[10px] font-black px-1.5 py-0.5 rounded-tl-lg border-t border-l border-white/10">
                        {player.shirtNumber}
                    </div>
                )}
                {player.statistics?.rating && (
                    <div className={`absolute top-0 right-0 ${ratingColor} text-white text-[8px] md:text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg z-20 shadow-sm border-b border-l border-black/10`}>
                        {player.statistics.rating.toFixed(1)}
                    </div>
                )}
            </div>
            <div className="mt-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full text-[9px] md:text-[11px] text-white font-bold text-center w-full truncate border border-white/10 shadow-lg max-w-[140%] md:max-w-[100px] tracking-tight">
                {player.name.split(' ').pop()}
            </div>
        </button>
    );
};

const SoccerField: React.FC<SoccerFieldProps> = ({ lineups, onSelectPlayer }) => {
  const [showSubs, setShowSubs] = useState(false);
  const [previewPlayer, setPreviewPlayer] = useState<GamePlayer | null>(null);

  const organizeByPosition = (players: GamePlayer[]) => {
    const lines = { G: [] as GamePlayer[], D: [] as GamePlayer[], M: [] as GamePlayer[], F: [] as GamePlayer[] };
    players.forEach(p => {
        const pos = p.position?.toUpperCase() || 'M';
        if (pos.includes('G')) lines.G.push(p);
        else if (pos.includes('D')) lines.D.push(p);
        else if (pos.includes('F') || pos.includes('A')) lines.F.push(p);
        else lines.M.push(p);
    });
    return [lines.G, lines.D, lines.M, lines.F];
  };

  const homeLines = organizeByPosition(lineups.home.starters);
  const awayLines = organizeByPosition(lineups.away.starters).reverse();

  const handleSelect = (player: GamePlayer) => {
      onSelectPlayer(player);
      setPreviewPlayer(null);
  };

  return (
    <div className="w-full space-y-4 relative">
      
      {/* Player Stats Modal Overlay */}
      {previewPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setPreviewPlayer(null)} />
            
            <div className="relative bg-zinc-900/95 backdrop-blur-xl w-full max-w-[320px] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/5">
                {/* Header */}
                <div className="bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 p-6 border-b border-white/5 relative">
                     <button 
                        onClick={() => setPreviewPlayer(null)}
                        className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-black/20 rounded-full p-2 transition-colors"
                     >
                        <X size={18} />
                     </button>
                     <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-black overflow-hidden border border-white/10 shadow-lg ring-1 ring-black/50">
                            <SofaImage playerId={previewPlayer.id} alt="" className="w-full h-full object-cover"/>
                        </div>
                        <div>
                            <div className="text-xl font-black text-white leading-none uppercase tracking-tighter truncate max-w-[160px]">{previewPlayer.name}</div>
                            <div className="text-[10px] text-zinc-400 font-bold mt-2 flex items-center gap-2">
                                <span className="bg-white/5 px-2.5 py-1 rounded-lg text-white border border-white/5">{previewPlayer.position}</span>
                                <span className="font-mono text-zinc-500">#{previewPlayer.shirtNumber}</span>
                            </div>
                        </div>
                     </div>
                </div>

                {/* Stats Grid */}
                <div className="p-6 grid grid-cols-2 gap-3">
                    {previewPlayer.statistics ? (
                        <>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                                <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-1">Nota Sofa</div>
                                <div className={`text-3xl font-black ${
                                    (previewPlayer.statistics.rating || 0) >= 7.0 ? 'text-emerald-400' : 'text-zinc-300'
                                }`}>
                                    {previewPlayer.statistics.rating?.toFixed(1) || '-'}
                                </div>
                            </div>
                            <div className="bg-black/30 p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                                <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-1">Gols/Assis</div>
                                <div className="text-3xl font-black text-white font-mono tracking-tighter">
                                    {previewPlayer.statistics.goals || 0}<span className="text-zinc-600 mx-1">/</span>{previewPlayer.statistics.assists || 0}
                                </div>
                            </div>
                            <div className="col-span-2 grid grid-cols-3 gap-2 mt-2">
                                <div className="text-center p-3 bg-zinc-800/30 rounded-2xl border border-white/5">
                                    <Target size={18} className="mx-auto text-blue-400 mb-2" />
                                    <div className="text-[8px] text-zinc-500 uppercase font-black tracking-wide mb-0.5">Chutes</div>
                                    <div className="text-lg font-black text-white leading-none">{previewPlayer.statistics.totalShots || 0}</div>
                                </div>
                                <div className="text-center p-3 bg-zinc-800/30 rounded-2xl border border-white/5">
                                    <TrendingUp size={18} className="mx-auto text-emerald-400 mb-2" />
                                    <div className="text-[8px] text-zinc-500 uppercase font-black tracking-wide mb-0.5">Passes</div>
                                    <div className="text-lg font-black text-white leading-none">{previewPlayer.statistics.totalPasses || 0}</div>
                                </div>
                                <div className="text-center p-3 bg-zinc-800/30 rounded-2xl border border-white/5">
                                    <Shield size={18} className="mx-auto text-orange-400 mb-2" />
                                    <div className="text-[8px] text-zinc-500 uppercase font-black tracking-wide mb-0.5">Desarmes</div>
                                    <div className="text-lg font-black text-white leading-none">{previewPlayer.statistics.tackles || 0}</div>
                                </div>
                                <div className="text-center p-3 bg-zinc-800/30 rounded-2xl border border-white/5">
                                    <Activity size={18} className="mx-auto text-purple-400 mb-2" />
                                    <div className="text-[8px] text-zinc-500 uppercase font-black tracking-wide mb-0.5">Intercep.</div>
                                    <div className="text-lg font-black text-white leading-none">{previewPlayer.statistics.interceptions || 0}</div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="col-span-2 text-center py-6 text-xs text-zinc-500 font-medium bg-black/20 rounded-2xl border border-white/5 border-dashed">
                            Sem estatísticas detalhadas no momento.
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-6 pt-0">
                    <button 
                        onClick={() => handleSelect(previewPlayer)}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/20 hover:shadow-emerald-500/20"
                    >
                        <UserPlus size={18} />
                        Adicionar ao Radar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Field Container */}
      <div 
        className={`relative w-full h-[640px] md:h-auto md:aspect-video bg-gradient-to-b md:bg-gradient-to-r from-emerald-800 to-emerald-700 rounded-2xl overflow-hidden shadow-2xl border border-emerald-900/50 transition-all duration-300 ${previewPlayer ? 'scale-[0.96] blur-[2px] opacity-60' : ''}`}
      >
        
        {/* Field Markings */}
        <div className="absolute inset-0 opacity-20 pointer-events-none z-0">
             {/* Center Line */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 md:w-0.5 md:h-full md:top-0 md:left-1/2 bg-white/70 -translate-y-1/2 md:-translate-x-1/2 md:translate-y-0"></div>
            
            {/* Center Circle */}
            <div className="absolute top-1/2 left-1/2 w-24 h-24 md:w-32 md:h-32 border-2 border-white/70 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            
            {/* Home Penalty Area */}
            <div className="absolute top-0 md:top-1/2 left-1/2 md:left-0 w-1/2 md:w-[15%] h-[15%] md:h-1/2 border-white/70 rounded-b-xl md:rounded-b-none md:rounded-r-xl border-b-2 border-x-2 md:border-y-2 md:border-r-2 md:border-l-0 -translate-x-1/2 md:translate-x-0 md:-translate-y-1/2"></div>
            
            {/* Away Penalty Area */}
            <div className="absolute bottom-0 md:bottom-auto md:top-1/2 left-1/2 md:right-0 md:left-auto w-1/2 md:w-[15%] h-[15%] md:h-1/2 border-white/70 rounded-t-xl md:rounded-t-none md:rounded-l-xl border-t-2 border-x-2 md:border-y-2 md:border-l-2 md:border-r-0 -translate-x-1/2 md:translate-x-0 md:-translate-y-1/2"></div>
            
            {/* Grass Texture Effect */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-10 mix-blend-overlay"></div>
        </div>

        {/* Home Team (Top/Left) */}
        <div className="absolute top-0 left-0 w-full h-1/2 md:w-1/2 md:h-full z-10 flex flex-col md:flex-row justify-evenly items-center py-4 md:py-0 md:px-4">
            <div className="absolute top-2 left-2 md:top-4 md:left-4 z-20">
                <span className="bg-black/40 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest backdrop-blur-md border border-white/10 shadow-lg">
                    {lineups.home.name}
                </span>
            </div>
            
            {homeLines.map((line, i) => (
                <div key={`h-${i}`} className="flex-1 flex flex-row md:flex-col justify-evenly md:justify-center items-center w-full md:w-auto md:h-full gap-2">
                    {line.map(p => <PlayerNode key={p.id} player={p} onSelect={() => setPreviewPlayer(p)} />)}
                </div>
            ))}
        </div>

        {/* Away Team (Bottom/Right) */}
        <div className="absolute bottom-0 right-0 w-full h-1/2 md:w-1/2 md:h-full z-10 flex flex-col md:flex-row justify-evenly items-center py-4 md:py-0 md:px-4">
            {awayLines.map((line, i) => (
                <div key={`a-${i}`} className="flex-1 flex flex-row md:flex-col justify-evenly md:justify-center items-center w-full md:w-auto md:h-full gap-2">
                        {line.map(p => <PlayerNode key={p.id} player={p} onSelect={() => setPreviewPlayer(p)} />)}
                </div>
            ))}

            <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-20">
                <span className="bg-black/40 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest backdrop-blur-md border border-white/10 shadow-lg">
                    {lineups.away.name}
                </span>
            </div>
        </div>
      </div>

      {/* Substitutes Toggle */}
      <div className={`bg-zinc-900/50 backdrop-blur-md rounded-[2rem] border border-white/5 overflow-hidden transition-all shadow-xl ${previewPlayer ? 'opacity-30 pointer-events-none' : ''}`}>
        <button 
            onClick={() => setShowSubs(!showSubs)}
            className="w-full flex items-center justify-between p-5 text-sm font-black text-zinc-300 hover:bg-white/5 transition-colors uppercase tracking-widest"
        >
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-zinc-600"></div>
                <span>Reservas ({lineups.home.substitutes.length + lineups.away.substitutes.length})</span>
            </div>
            {showSubs ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        
        {showSubs && (
            <div className="p-4 bg-black/20 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                <div>
                    <div className="text-[10px] text-zinc-500 mb-3 font-black uppercase tracking-[0.2em] flex items-center gap-2">
                        <div className="w-1 h-3 bg-emerald-500 rounded-full"></div>
                        {lineups.home.name}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                        {lineups.home.substitutes.map(p => (
                            <button 
                                key={p.id} 
                                onClick={() => setPreviewPlayer(p)}
                                className="w-full text-left text-xs p-3 rounded-xl bg-white/5 hover:bg-white/10 hover:text-emerald-400 transition-all flex items-center gap-3 group border border-transparent hover:border-emerald-500/20 active:scale-[0.98]"
                            >
                                <span className="font-mono text-zinc-500 w-6 text-center font-black bg-black/30 rounded py-0.5">{p.shirtNumber}</span>
                                <span className="truncate flex-1 font-bold tracking-tight">{p.name}</span>
                                {p.statistics?.rating && (
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg shadow-sm ${
                                        p.statistics.rating >= 7 ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                        {p.statistics.rating.toFixed(1)}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] text-zinc-500 mb-3 font-black uppercase tracking-[0.2em] flex items-center gap-2">
                        <div className="w-1 h-3 bg-blue-500 rounded-full"></div>
                        {lineups.away.name}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                        {lineups.away.substitutes.map(p => (
                            <button 
                                key={p.id} 
                                onClick={() => setPreviewPlayer(p)}
                                className="w-full text-left text-xs p-3 rounded-xl bg-white/5 hover:bg-white/10 hover:text-emerald-400 transition-all flex items-center gap-3 group border border-transparent hover:border-emerald-500/20 active:scale-[0.98]"
                            >
                                <span className="font-mono text-zinc-500 w-6 text-center font-black bg-black/30 rounded py-0.5">{p.shirtNumber}</span>
                                <span className="truncate flex-1 font-bold tracking-tight">{p.name}</span>
                                {p.statistics?.rating && (
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg shadow-sm ${
                                        p.statistics.rating >= 7 ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                        {p.statistics.rating.toFixed(1)}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default SoccerField;
