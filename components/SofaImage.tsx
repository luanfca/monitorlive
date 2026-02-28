import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { getPlayerImageUrl } from '../services/sofaService';

interface SofaImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  playerId: number;
}

const SofaImage: React.FC<SofaImageProps> = ({ playerId, className, alt, ...props }) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Native: Fetch via CapacitorHttp to bypass CORS/Referer checks
          // We use the direct URL logic but manually fetch the data
          const url = `https://api.sofascore.app/api/v1/player/${playerId}/image`;
          
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
          console.error('Failed to load native image', e);
          if (isMounted) setError(true);
        }
      } else {
        // Web: Use proxy URL from service
        setImageSrc(getPlayerImageUrl(playerId));
      }
    };

    load();
    return () => { isMounted = false; };
  }, [playerId]);

  if (error) {
      return (
        <div className={`bg-zinc-800 flex items-center justify-center ${className}`} {...props}>
            <span className="text-zinc-600 text-[8px] font-bold">IMG</span>
        </div>
      );
  }

  if (!imageSrc) {
      return <div className={`bg-zinc-800 animate-pulse ${className}`} {...props} />;
  }

  return (
    <img 
        src={imageSrc} 
        alt={alt || ''} 
        className={className} 
        onError={() => setError(true)} 
        {...props} 
    />
  );
};

export default SofaImage;
