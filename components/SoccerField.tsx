
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
    const ratingColor = !player.statistics?.rating ? 'bg-zinc-700 text-zinc-300' :
                        player.statistics.rating >= 8.0 ? 'bg-blue-600 text-white' :
                        player.statistics.rating >= 7.5 ? 'bg-blue-500 text-white' :
                        player.statistics.rating >= 7.0 ? 'bg-emerald-500 text-white' :
                        player.statistics.rating >= 6.5 ? 'bg-yellow-500 text-black' :
                        player.statistics.rating >= 6.0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white';

    return (
        <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="flex flex-col items-center justify-center relative group transition-transform active:scale-90"
        >
            <div className="relative">
                <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full bg-[#2a2a2a] border-2 border-[#121212] shadow-lg overflow-hidden relative z-10 group-hover:border-blue-500 transition-colors">
                    <SofaImage
                        playerId={player.id}
                        alt={player.name}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-[#2a2a2a] hidden items-center justify-center text-zinc-500 font-bold text-xs">
                        {player.shirtNumber || '?'}
                    </div>
                </div>
                
                {/* Rating Badge */}
                {player.statistics?.rating && (
                    <div className={`absolute -bottom-1.5 -right-1.5 ${ratingColor} text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md z-20 shadow-sm border border-[#121212] min-w-[24px] text-center`}>
                        {player.statistics.rating.toFixed(1)}
                    </div>
                )}
                
                {/* Shirt Number Badge (Fallback) */}
                {player.shirtNumber && !player.statistics?.rating && (
                    <div className="absolute -bottom-1.5 -right-1.5 bg-[#1e1e1e] text-zinc-300 text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md z-20 shadow-sm border border-[#121212] min-w-[24px] text-center">
                        {player.shirtNumber}
                    </div>
                )}
            </div>
            <div className="mt-2 bg-[#1e1e1e]/90 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] md:text-[10px] text-white font-bold text-center w-full truncate border border-white/5 shadow-sm max-w-[120%] md:max-w-[80px] tracking-tight">
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
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewPlayer(null)} />
            
            <div className="relative bg-[#1e1e1e] w-full max-w-[320px] rounded-3xl border border-white/5 shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-[#2a2a2a] p-6 border-b border-white/5 relative">
                     <button 
                        onClick={() => setPreviewPlayer(null)}
                        className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-black/20 rounded-full p-2 transition-colors"
                     >
                        <X size={18} />
                     </button>
                     <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-[#121212] overflow-hidden border border-white/10 shadow-lg shrink-0">
                            <SofaImage playerId={previewPlayer.id} alt="" className="w-full h-full object-cover"/>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-lg font-bold text-white leading-tight truncate">{previewPlayer.name}</div>
                            <div className="text-xs text-zinc-400 font-medium mt-1 flex items-center gap-2">
                                <span className="bg-[#121212] px-2 py-0.5 rounded text-white">{previewPlayer.position}</span>
                                <span className="font-mono text-zinc-500">#{previewPlayer.shirtNumber}</span>
                            </div>
                        </div>
                     </div>
                </div>

                {/* Stats Grid */}
                <div className="p-6 grid grid-cols-2 gap-3">
                    {previewPlayer.statistics ? (
                        <>
                            <div className="bg-[#121212] p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Nota Sofa</div>
                                <div className={`text-2xl font-bold ${
                                    !previewPlayer.statistics.rating ? 'text-zinc-500' :
                                    previewPlayer.statistics.rating >= 8.0 ? 'text-blue-600' :
                                    previewPlayer.statistics.rating >= 7.5 ? 'text-blue-500' :
                                    previewPlayer.statistics.rating >= 7.0 ? 'text-emerald-500' :
                                    previewPlayer.statistics.rating >= 6.5 ? 'text-yellow-500' :
                                    previewPlayer.statistics.rating >= 6.0 ? 'text-orange-500' : 'text-red-500'
                                }`}>
                                    {previewPlayer.statistics.rating?.toFixed(1) || '-'}
                                </div>
                            </div>
                            <div className="bg-[#121212] p-4 rounded-2xl border border-white/5 flex flex-col items-center">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Gols/Assis</div>
                                <div className="text-2xl font-bold text-white font-mono">
                                    {previewPlayer.statistics.goals || 0}<span className="text-zinc-600 mx-1">/</span>{previewPlayer.statistics.assists || 0}
                                </div>
                            </div>
                            <div className="col-span-2 grid grid-cols-4 gap-2 mt-2">
                                <div className="text-center p-3 bg-[#121212] rounded-xl border border-white/5">
                                    <Target size={16} className="mx-auto text-blue-400 mb-1.5" />
                                    <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide mb-0.5">Chutes</div>
                                    <div className="text-base font-bold text-white leading-none">{previewPlayer.statistics.totalShots || 0}</div>
                                </div>
                                <div className="text-center p-3 bg-[#121212] rounded-xl border border-white/5">
                                    <TrendingUp size={16} className="mx-auto text-emerald-400 mb-1.5" />
                                    <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide mb-0.5">Passes</div>
                                    <div className="text-base font-bold text-white leading-none">{previewPlayer.statistics.totalPasses || 0}</div>
                                </div>
                                <div className="text-center p-3 bg-[#121212] rounded-xl border border-white/5">
                                    <Shield size={16} className="mx-auto text-orange-400 mb-1.5" />
                                    <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide mb-0.5">Desarmes</div>
                                    <div className="text-base font-bold text-white leading-none">{previewPlayer.statistics.tackles || 0}</div>
                                </div>
                                <div className="text-center p-3 bg-[#121212] rounded-xl border border-white/5">
                                    <Activity size={16} className="mx-auto text-purple-400 mb-1.5" />
                                    <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wide mb-0.5">Intercep.</div>
                                    <div className="text-base font-bold text-white leading-none">{previewPlayer.statistics.interceptions || 0}</div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="col-span-2 text-center py-6 text-xs text-zinc-500 font-medium bg-[#121212] rounded-2xl border border-white/5">
                            Sem estatísticas detalhadas no momento.
                        </div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-6 pt-0">
                    <button 
                        onClick={() => handleSelect(previewPlayer)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
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
        className={`relative w-full h-[640px] md:h-auto md:aspect-[4/3] lg:aspect-video bg-[#121212] rounded-3xl overflow-hidden shadow-2xl border border-white/5 transition-all duration-300 ${previewPlayer ? 'scale-[0.98] blur-[2px] opacity-50' : ''}`}
      >
        
        {/* Field Markings */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0">
             {/* Center Line */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 md:w-0.5 md:h-full md:top-0 md:left-1/2 bg-white -translate-y-1/2 md:-translate-x-1/2 md:translate-y-0"></div>
            
            {/* Center Circle */}
            <div className="absolute top-1/2 left-1/2 w-24 h-24 md:w-32 md:h-32 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            
            {/* Home Penalty Area */}
            <div className="absolute top-0 md:top-1/2 left-1/2 md:left-0 w-1/2 md:w-[15%] h-[15%] md:h-1/2 border-white rounded-b-2xl md:rounded-b-none md:rounded-r-2xl border-b-2 border-x-2 md:border-y-2 md:border-r-2 md:border-l-0 -translate-x-1/2 md:translate-x-0 md:-translate-y-1/2"></div>
            
            {/* Away Penalty Area */}
            <div className="absolute bottom-0 md:bottom-auto md:top-1/2 left-1/2 md:right-0 md:left-auto w-1/2 md:w-[15%] h-[15%] md:h-1/2 border-white rounded-t-2xl md:rounded-t-none md:rounded-l-2xl border-t-2 border-x-2 md:border-y-2 md:border-l-2 md:border-r-0 -translate-x-1/2 md:translate-x-0 md:-translate-y-1/2"></div>
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
      <div className={`bg-[#121212] rounded-3xl border border-white/5 overflow-hidden transition-all shadow-xl ${previewPlayer ? 'opacity-30 pointer-events-none' : ''}`}>
        <button 
            onClick={() => setShowSubs(!showSubs)}
            className="w-full flex items-center justify-between p-5 text-sm font-bold text-zinc-300 hover:bg-[#1e1e1e] transition-colors tracking-wide"
        >
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-zinc-600"></div>
                <span>Reservas ({lineups.home.substitutes.length + lineups.away.substitutes.length})</span>
            </div>
            {showSubs ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        
        {showSubs && (
            <div className="p-4 bg-[#0a0a0a] border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                <div>
                    <div className="text-[10px] text-zinc-500 mb-3 font-bold uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-3 bg-blue-500 rounded-full"></div>
                        {lineups.home.name}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                        {lineups.home.substitutes.map(p => {
                            const ratingColor = !p.statistics?.rating ? 'bg-[#1e1e1e] text-zinc-400' :
                                                p.statistics.rating >= 8.0 ? 'bg-blue-600 text-white' :
                                                p.statistics.rating >= 7.5 ? 'bg-blue-500 text-white' :
                                                p.statistics.rating >= 7.0 ? 'bg-emerald-500 text-white' :
                                                p.statistics.rating >= 6.5 ? 'bg-yellow-500 text-black' :
                                                p.statistics.rating >= 6.0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white';
                            return (
                                <button 
                                    key={p.id} 
                                    onClick={() => setPreviewPlayer(p)}
                                    className="w-full text-left text-xs p-3 rounded-xl bg-[#121212] hover:bg-[#1e1e1e] hover:text-blue-400 transition-all flex items-center gap-3 group border border-transparent hover:border-blue-500/20 active:scale-[0.98]"
                                >
                                    <span className="font-mono text-zinc-500 w-6 text-center font-bold bg-[#1e1e1e] rounded py-0.5">{p.shirtNumber}</span>
                                    <span className="truncate flex-1 font-bold tracking-tight">{p.name}</span>
                                    {p.statistics?.rating && (
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm ${ratingColor}`}>
                                            {p.statistics.rating.toFixed(1)}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] text-zinc-500 mb-3 font-bold uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-3 bg-blue-500 rounded-full"></div>
                        {lineups.away.name}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                        {lineups.away.substitutes.map(p => {
                            const ratingColor = !p.statistics?.rating ? 'bg-[#1e1e1e] text-zinc-400' :
                                                p.statistics.rating >= 8.0 ? 'bg-blue-600 text-white' :
                                                p.statistics.rating >= 7.5 ? 'bg-blue-500 text-white' :
                                                p.statistics.rating >= 7.0 ? 'bg-emerald-500 text-white' :
                                                p.statistics.rating >= 6.5 ? 'bg-yellow-500 text-black' :
                                                p.statistics.rating >= 6.0 ? 'bg-orange-500 text-white' : 'bg-red-500 text-white';
                            return (
                                <button 
                                    key={p.id} 
                                    onClick={() => setPreviewPlayer(p)}
                                    className="w-full text-left text-xs p-3 rounded-xl bg-[#121212] hover:bg-[#1e1e1e] hover:text-blue-400 transition-all flex items-center gap-3 group border border-transparent hover:border-blue-500/20 active:scale-[0.98]"
                                >
                                    <span className="font-mono text-zinc-500 w-6 text-center font-bold bg-[#1e1e1e] rounded py-0.5">{p.shirtNumber}</span>
                                    <span className="truncate flex-1 font-bold tracking-tight">{p.name}</span>
                                    {p.statistics?.rating && (
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm ${ratingColor}`}>
                                            {p.statistics.rating.toFixed(1)}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default SoccerField;
