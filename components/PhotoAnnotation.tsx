
import React, { useRef, useEffect, useState } from 'react';

interface PhotoAnnotationProps {
  imageSrc: string;
  onSave: (annotatedImage: string) => void;
  onCancel: () => void;
}

export const PhotoAnnotation: React.FC<PhotoAnnotationProps> = ({ imageSrc, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Scale canvas to fit image aspect ratio but maintain max dimensions
      const maxWidth = window.innerWidth - 32;
      const maxHeight = window.innerHeight - 200;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // Set drawing styles
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL('image/jpeg', 0.8));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="text-white mb-4 text-center">
        <h3 className="text-lg font-bold">Annotate Photo</h3>
        <p className="text-sm opacity-70">Draw with your finger to highlight issues</p>
      </div>
      
      <div className="relative border-4 border-red-500 rounded-lg overflow-hidden bg-white shadow-2xl">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="touch-none cursor-crosshair"
        />
      </div>

      <div className="mt-8 flex gap-4 w-full max-w-sm">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-6 rounded-xl bg-gray-800 text-white font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-3 px-6 rounded-xl bg-red-600 text-white font-semibold shadow-lg shadow-red-900/20"
        >
          Save
        </button>
      </div>
    </div>
  );
};
