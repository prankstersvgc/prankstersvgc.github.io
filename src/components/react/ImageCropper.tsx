import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Não consegui carregar a imagem.')));
    img.src = src;
  });
}

async function getCroppedBlob(imageUrl: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não suportado.');
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem recortada.'))),
      'image/jpeg',
      0.9,
    );
  });
}

interface ImageCropperProps {
  file: File;
  aspect?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export default function ImageCropper({ file, aspect = 16 / 9, onCancel, onConfirm }: ImageCropperProps) {
  const [imageUrl] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setError(null);
    setWorking(true);
    try {
      const blob = await getCroppedBlob(imageUrl, croppedAreaPixels);
      onConfirm(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recortar a imagem.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-prank-border bg-prank-bg p-3">
      <div className="relative h-56 w-full overflow-hidden rounded bg-black">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-prank-purple"
        />
      </div>

      <p className="text-xs text-white/40">Arraste a imagem pra posicionar o que vai aparecer na capa.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-prank-border px-3 py-2 text-sm font-semibold text-white/60 hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={working}
          className="rounded-md bg-prank-purple px-4 py-2 text-sm font-display font-semibold text-white transition-colors hover:bg-prank-purple/80 disabled:opacity-50"
        >
          {working ? 'Aplicando...' : 'Aplicar recorte'}
        </button>
      </div>
    </div>
  );
}
