import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { getPlayerHeatmapUrl } from '../services/sofaService';

interface SofaHeatmapProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  eventId: number;
  playerId: number;
}

const SofaHeatmap: React.FC<SofaHeatmapProps> = ({ eventId, playerId, className, alt, ...props }) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Native: Fetch via CapacitorHttp to bypass CORS/Referer checks
          const url = `https://api.sofascore.com/api/v1/event/${eventId}/player/${playerId}/heatmap`;
          
          const response = await CapacitorHttp.get({
            url,
            responseType: 'blob', // Returns base64 in data
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.sofascore.com/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
          });

          if (response.status === 200 && response.data) {
             const contentType = response.headers['Content-Type'] || response.headers['content-type'] || 'image/png';
             if (isMounted) setImageSrc(`data:${contentType};base64,${response.data}`);
          } else {
             if (isMounted) setError(true);
          }
        } catch (e) {
          console.error('Failed to load native heatmap', e);
          if (isMounted) setError(true);
        }
      } else {
        // Web: Use proxy URL from service
        setImageSrc(`${getPlayerHeatmapUrl(eventId, playerId)}?t=${Date.now()}`);
      }
    };

    load();
    return () => { isMounted = false; };
  }, [eventId, playerId]);

  if (error) {
      return (
        <div className={`flex flex-col items-center justify-center text-zinc-600 gap-2 ${className}`} {...props}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/><circle cx="12" cy="12" r="10"/></svg>
            <span className="text-[8px] font-black uppercase tracking-widest">Mapa indisponível</span>
        </div>
      );
  }

  if (!imageSrc) {
      return <div className={`bg-zinc-800/50 animate-pulse ${className}`} {...props} />;
  }

  return (
    <img 
        src={imageSrc} 
        alt={alt || 'Heatmap'} 
        className={className} 
        onError={() => setError(true)} 
        {...props} 
    />
  );
};

export default SofaHeatmap;
