/**
 * Cámara — fase inicial:
 *  - Escaneo de código de barras: busca en la base local de productos que vos
 *    asociaste. Si no existe, se carga manualmente y queda guardado para la próxima.
 *  - Foto del producto: se asocia al lote del inventario.
 * No hay reconocimiento automático de alimentos ni tickets todavía (fase posterior).
 */
import React, { useRef, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Directory, Paths } from 'expo-file-system';
import { Body, Button, Chip, Field, Notice, Row, Screen, Stepper } from '../src/ui/components';
import { useAppData } from '../src/state/AppData';
import { matchIngredient } from '../src/domain/textParser';
import type { InventoryLocation, Unit } from '../src/domain/types';
import { LOCATION_LABEL } from '../src/ui/labels';

export default function Escanear() {
  const [perm, request] = useCameraPermissions();
  const { data, repo, commit } = useAppData();
  const cam = useRef<CameraView>(null);
  const [mode, setMode] = useState<'codigo' | 'foto'>('codigo');
  const [barcode, setBarcode] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [ingredientId, setIngredientId] = useState<string | undefined>();
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState<Unit>('un');
  const [loc, setLoc] = useState<InventoryLocation>('heladera');

  if (!perm) return <Screen><Body>Cargando cámara…</Body></Screen>;
  if (!perm.granted) return <Screen><Body>Necesitamos permiso para usar la cámara.</Body><Button title="Dar permiso" onPress={request} /></Screen>;

  async function onCode(code: string) {
    if (barcode) return;
    setBarcode(code);
    const p = await repo.productByBarcode(code);
    if (p) {
      setName(p.name); setIngredientId(p.ingredientId); if (p.defaultQty) setQty(p.defaultQty); if (p.unit) setUnit(p.unit);
    }
  }

  async function takePhoto() {
    const pic = await cam.current?.takePictureAsync({ quality: 0.5 });
    if (!pic) return;
    const dir = new Directory(Paths.document, 'fotos');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `prod_${Date.now()}.jpg`);
    new File(pic.uri).copy(dest);
    setPhoto(dest.uri);
  }

  function pickIngredient(text: string) {
    setName(text);
    const m = matchIngredient(text, data.ingredientList);
    setIngredientId(m?.id);
    if (m) setUnit(m.defaultUnit);
  }

  async function save() {
    if (!ingredientId) return Alert.alert('Elegí el producto', 'Escribí un nombre que coincida con un ingrediente del catálogo.');
    if (qty <= 0) return Alert.alert('Indicá la cantidad');
    await commit(async (r) => {
      if (barcode) await r.saveProduct({ barcode, name: name || data.ingredients.get(ingredientId)!.name, ingredientId, defaultQty: qty, unit });
      await r.addLot({ ingredientId, qty, unit, location: loc, state: loc === 'freezer' ? 'congelado' : 'cerrado', photoUri: photo ?? undefined, purchasedAt: new Date().toISOString().slice(0, 10) });
    });
    router.back();
  }

  const scanned = barcode || photo;
  return (
    <Screen>
      <Row><Chip label="Código de barras" active={mode === 'codigo'} onPress={() => setMode('codigo')} /><Chip label="Foto" active={mode === 'foto'} onPress={() => setMode('foto')} /></Row>
      {!scanned ? (
        <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
          <CameraView
            ref={cam}
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={mode === 'codigo' ? ({ data: code }) => onCode(code) : undefined}
          />
        </View>
      ) : null}
      {mode === 'foto' && !photo ? <Button title="Sacar foto" onPress={takePhoto} /> : null}
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 200, borderRadius: 16 }} /> : null}
      {barcode ? <Body muted>Código: {barcode}</Body> : null}
      {scanned ? (
        <>
          {barcode && !ingredientId ? <Notice>Producto no encontrado en tu base. Cargalo una vez y la próxima lo reconoce.</Notice> : null}
          <Field label="Producto" value={name} onChangeText={pickIngredient} placeholder="Ej.: yogur griego" />
          <Body small muted>{ingredientId ? `Se asocia a: ${data.ingredients.get(ingredientId)?.name}` : 'Sin coincidencia en el catálogo'}</Body>
          <Row style={{ justifyContent: 'space-between' }}><Body>Cantidad</Body><Stepper value={qty} step={unit === 'un' ? 1 : 50} onChange={setQty} suffix={unit} /></Row>
          <Row wrap>{(['un', 'g', 'kg', 'ml', 'l'] as Unit[]).map((u) => <Chip key={u} label={u} active={unit === u} onPress={() => setUnit(u)} />)}</Row>
          <Row wrap>{(['heladera', 'freezer', 'alacena'] as InventoryLocation[]).map((l) => <Chip key={l} label={LOCATION_LABEL[l]} active={loc === l} onPress={() => setLoc(l)} />)}</Row>
          <Button title="Agregar al inventario" onPress={save} />
          <Button kind="ghost" title="Escanear otro" onPress={() => { setBarcode(null); setPhoto(null); setName(''); setIngredientId(undefined); }} />
        </>
      ) : null}
      <Body small muted>Próximamente: reconocer ingredientes por foto y leer tickets. Siempre te pediremos confirmar cantidades.</Body>
    </Screen>
  );
}
