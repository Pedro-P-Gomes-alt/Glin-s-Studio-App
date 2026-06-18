import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { saveProjectImage, deleteProjectImage, imageSrc } from "../utils/images";

// Per-commission workspace: measurements, annotations and reference pictures,
// so Glin can pull up everything about a client's job next time.
//
// Two modes:
//   readOnly=true  → opened by clicking a commission; view-only quick reference.
//   readOnly=false → opened by the "Details" button; full editing.
//
// Suggested measurement labels offered as quick-add chips (edit mode only).
const SUGGESTED = ["Bust", "Waist", "Hips", "Height", "Shoulder", "Arm length", "Inseam", "Head"];

function Thumb({ image, readOnly, onOpen, onDelete }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { imageSrc(image.image_path).then(setSrc); }, [image.image_path]);
  return (
    <div className="ws-thumb">
      {src
        ? <img src={src} alt={image.caption || "reference"} onClick={() => onOpen(src)} />
        : <div className="ws-thumb-loading" />}
      {!readOnly && (
        <button className="ws-thumb-del" title="Remove picture"
          onClick={() => onDelete(image)}>✕</button>
      )}
    </div>
  );
}

export default function Workspace({ project, readOnly = false, onClose }) {
  const [measurements, setMeasurements] = useState([]);
  const [images, setImages] = useState([]);
  const [notes, setNotes] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => { loadAll(); }, [project.id]);

  async function loadAll() {
    const [m, img, det] = await Promise.all([
      query(`SELECT * FROM project_measurements WHERE project_id = ? ORDER BY sort_order, id`, [project.id]),
      query(`SELECT * FROM project_images WHERE project_id = ? ORDER BY created_at, id`, [project.id]),
      query(`SELECT notes FROM project_details WHERE project_id = ?`, [project.id]),
    ]);
    setMeasurements(m);
    setImages(img);
    setNotes(det[0]?.notes ?? "");
  }

  async function addMeasurement(label) {
    const l = (label ?? newLabel).trim();
    if (!l) return;
    const maxOrder = measurements.reduce((mx, x) => Math.max(mx, x.sort_order), 0);
    await execute(
      `INSERT INTO project_measurements (project_id, label, value, sort_order) VALUES (?, ?, ?, ?)`,
      [project.id, l, newValue.trim() || null, maxOrder + 1]
    );
    setNewLabel(""); setNewValue("");
    setMeasurements(await query(
      `SELECT * FROM project_measurements WHERE project_id = ? ORDER BY sort_order, id`, [project.id]));
  }

  async function updateMeasurement(id, value) {
    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, value } : m));
    await execute(`UPDATE project_measurements SET value = ? WHERE id = ?`, [value || null, id]);
  }

  async function deleteMeasurement(id) {
    await execute(`DELETE FROM project_measurements WHERE id = ?`, [id]);
    setMeasurements(prev => prev.filter(m => m.id !== id));
  }

  async function saveNotes() {
    await execute(
      `INSERT INTO project_details (project_id, notes, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET notes = excluded.notes, updated_at = datetime('now')`,
      [project.id, notes.trim() || null]
    );
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const relPath = await saveProjectImage(project.id, file);
        await execute(`INSERT INTO project_images (project_id, image_path) VALUES (?, ?)`,
          [project.id, relPath]);
      }
      setImages(await query(
        `SELECT * FROM project_images WHERE project_id = ? ORDER BY created_at, id`, [project.id]));
    } finally {
      setUploading(false);
    }
  }

  async function deleteImage(image) {
    await execute(`DELETE FROM project_images WHERE id = ?`, [image.id]);
    await deleteProjectImage(image.image_path);
    setImages(prev => prev.filter(i => i.id !== image.id));
  }

  const hasMeasurements = measurements.length > 0;
  const hasImages = images.length > 0;
  const hasNotes = notes.trim().length > 0;
  const emptyReadOnly = readOnly && !hasMeasurements && !hasImages && !hasNotes;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel-wide" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{readOnly ? "Details" : "Workspace"}</h2>
            <p className="panel-subtitle">{project.title}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="ws-body">
          {emptyReadOnly && (
            <p className="empty-state">
              Nothing saved yet. Use <strong>Details</strong> to add measurements, notes and pictures.
            </p>
          )}

          {/* Measurements */}
          {(!readOnly || hasMeasurements) && (
            <section className="ws-section">
              <div className="ws-section-title">Measurements</div>
              {hasMeasurements && (
                <div className="ws-measure-list">
                  {measurements.map(m => (
                    <div key={m.id} className="ws-measure-row">
                      <span className="ws-measure-label">{m.label}</span>
                      {readOnly ? (
                        <span className="ws-measure-readonly">{m.value || "—"}</span>
                      ) : (
                        <>
                          <input
                            className="ws-measure-input"
                            value={m.value ?? ""}
                            placeholder="—"
                            onChange={e => updateMeasurement(m.id, e.target.value)}
                          />
                          <button className="btn-icon" title="Delete" onClick={() => deleteMeasurement(m.id)}>✕</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <>
                  <div className="ws-suggest">
                    {SUGGESTED.filter(s => !measurements.some(m => m.label.toLowerCase() === s.toLowerCase()))
                      .map(s => (
                        <button key={s} type="button" className="ws-chip" onClick={() => addMeasurement(s)}>+ {s}</button>
                      ))}
                  </div>
                  <div className="ws-measure-add">
                    <input placeholder="Label (e.g. Wrist)" value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMeasurement(); } }} />
                    <input placeholder="Value" value={newValue}
                      onChange={e => setNewValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMeasurement(); } }} />
                    <button type="button" className="btn-ghost sm" onClick={() => addMeasurement()}>+ Add</button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* Reference pictures */}
          {(!readOnly || hasImages) && (
            <section className="ws-section">
              <div className="ws-section-title">Reference pictures</div>
              <div className="ws-thumbs">
                {images.map(img => (
                  <Thumb key={img.id} image={img} readOnly={readOnly}
                    onOpen={setLightbox} onDelete={deleteImage} />
                ))}
                {!readOnly && (
                  <label className="ws-upload">
                    {uploading ? "Saving…" : "+ Add"}
                    <input type="file" accept="image/*" multiple hidden onChange={handleFiles} disabled={uploading} />
                  </label>
                )}
              </div>
            </section>
          )}

          {/* Annotations */}
          {(!readOnly || hasNotes) && (
            <section className="ws-section">
              <div className="ws-section-title">Annotations</div>
              {readOnly ? (
                <p className="ws-notes-readonly">{notes}</p>
              ) : (
                <>
                  <textarea
                    className="ws-notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Fabric choices, fitting notes, what to do differently next time…"
                    rows={6}
                  />
                  <div className="ws-notes-actions">
                    {savedFlash && <span className="ws-saved">Saved ✓</span>}
                    <button type="button" className="btn-primary sm" onClick={saveNotes}>Save notes</button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Lightbox — click a picture to see it big */}
      {lightbox && (
        <div className="lightbox" onClick={e => { e.stopPropagation(); setLightbox(null); }}>
          <img src={lightbox} alt="reference enlarged" />
          <button className="lightbox-close" onClick={e => { e.stopPropagation(); setLightbox(null); }}>✕</button>
        </div>
      )}
    </div>
  );
}
