import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Image as ImageIcon, FileUp, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReceiptUploadProps {
  file: File | null;
  preview: string | null;
  hasExistingReceipt?: boolean;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  onFileChange: (file: File | null) => void;
}

export function ReceiptUpload({
  file,
  preview,
  hasExistingReceipt,
  required,
  disabled,
  error,
  onFileChange,
}: ReceiptUploadProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileChange(selectedFile);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removeFile = () => {
    onFileChange(null);
  };

  if (disabled) {
    return hasExistingReceipt ? (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Comprovante anexado
        </span>
      </div>
    ) : null;
  }

  if (file) {
    const isImage = file.type.startsWith('image/');
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            className="w-12 h-12 object-cover rounded"
          />
        ) : (
          <FileText className="w-12 h-12 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={removeFile}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (hasExistingReceipt) {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Comprovante já anexado
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*,image/heic,image/heif"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Mobile-optimized buttons */}
      <div className={cn(
        "grid gap-2",
        "grid-cols-1 sm:grid-cols-3"
      )}>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-14 flex-col gap-1",
            error && "border-destructive"
          )}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="h-5 w-5" />
          <span className="text-xs">Tirar foto</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-14 flex-col gap-1",
            error && "border-destructive"
          )}
          onClick={() => photoInputRef.current?.click()}
        >
          <ImageIcon className="h-5 w-5" />
          <span className="text-xs">Escolher foto</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-14 flex-col gap-1",
            error && "border-destructive"
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="h-5 w-5" />
          <span className="text-xs">Anexar arquivo</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        PNG, JPG ou PDF até 10MB
      </p>

      {error && (
        <p className="text-sm text-destructive text-center">
          Comprovante é obrigatório conforme política da empresa
        </p>
      )}
    </div>
  );
}
