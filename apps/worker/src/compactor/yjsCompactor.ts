import * as Y from 'yjs';

export interface CompactedStateResult {
  compiledState: Buffer;
  elementsJson: Record<string, unknown>;
  vectorClock: string;
}

export function compileYDocState(
  baselineState: Uint8Array | Buffer | null,
  deltas: Array<Uint8Array | Buffer>
): CompactedStateResult {
  const doc = new Y.Doc();

  if (baselineState && baselineState.length > 0) {
    Y.applyUpdate(doc, new Uint8Array(baselineState));
  }

  for (const delta of deltas) {
    if (delta && delta.length > 0) {
      Y.applyUpdate(doc, new Uint8Array(delta));
    }
  }

  const compiledState = Buffer.from(Y.encodeStateAsUpdate(doc));
  const elementsMap = doc.getMap('canvas:elements');
  const elementsJson = elementsMap.toJSON() as Record<string, unknown>;

  const vectorClockArray = Array.from(Y.encodeStateVector(doc));
  const vectorClock = JSON.stringify(vectorClockArray);

  return {
    compiledState,
    elementsJson,
    vectorClock
  };
}
