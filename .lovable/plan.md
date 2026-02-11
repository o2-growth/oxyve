

# Conversao Automatica de HEIC para JPEG

## Problema

Fotos tiradas no iPhone sao salvas em formato HEIC, que nao e suportado nativamente pelos navegadores nem pela API da OpenAI Vision. Isso impede a validacao automatica de comprovantes.

## Solucao

Instalar a biblioteca `heic2any` para converter HEIC/HEIF para JPEG no frontend antes de enviar para validacao e upload.

## Implementacao

### 1. Instalar dependencia

- `heic2any` - biblioteca leve que converte HEIC para JPEG/PNG no browser usando WebAssembly

### 2. Criar utilitario de conversao

**Arquivo:** `src/lib/convertHeic.ts`

- Funcao `convertHeicToJpeg(file: File): Promise<File>` que:
  - Detecta se o arquivo e HEIC/HEIF (pelo MIME type ou extensao .heic/.heif)
  - Se for, converte para JPEG usando `heic2any`
  - Retorna o arquivo convertido como `File` com tipo `image/jpeg`
  - Se nao for HEIC, retorna o arquivo original sem alteracao

### 3. Integrar no `ExpenseFormDialog`

**Arquivo:** `src/components/expenses/ExpenseFormDialog.tsx`

- No `handleFileChange`, antes de gerar preview e disparar validacao:
  - Chamar `convertHeicToJpeg(file)` 
  - Usar o arquivo convertido para preview, validacao e upload
  - Mostrar um estado de "convertendo..." enquanto processa

### 4. Atualizar `ReceiptUpload`

**Arquivo:** `src/components/expenses/ReceiptUpload.tsx`

- Adicionar `image/heic,image/heif` nos `accept` dos inputs de camera e galeria para que o seletor de arquivos aceite HEIC

## Arquivos

| Arquivo | Acao |
|---------|------|
| `src/lib/convertHeic.ts` | Criar |
| `src/components/expenses/ExpenseFormDialog.tsx` | Editar (handleFileChange) |
| `src/components/expenses/ReceiptUpload.tsx` | Editar (accept attributes) |
| `package.json` | Adicionar `heic2any` |

## Fluxo

1. Usuario seleciona foto HEIC do iPhone
2. Frontend detecta formato HEIC
3. `heic2any` converte para JPEG automaticamente
4. Preview e exibido normalmente
5. Validacao via OpenAI Vision funciona com o JPEG convertido
6. Upload salva o arquivo ja convertido em JPEG

