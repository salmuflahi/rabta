import { useEffect, useRef } from "react";
import type { TeamCursor, TeamMember } from "./client";
import { personColor } from "./thread";

/** The brand spring: stiffness 260, damping 18, unit mass. */
const STIFFNESS = 260, DAMPING = 18;
type Motion = { x: number; y: number; vx: number; vy: number; tx: number; ty: number };

/**
 * Teammates' pointers over the Room: an arrow with a paper edge and a name
 * pill in the person's colour. Positions are fractions of the stage, so the
 * same cursor lands on the same spot in every window size. Movement is
 * interpolated on the brand spring between updates; under reduced motion the
 * cursor jumps to its last position.
 */
export function Cursors({ cursors, members, me }: { cursors: Record<string, TeamCursor>; members: TeamMember[]; me: string | null }) {
  const motions = useRef(new Map<string, Motion>());
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const peers = Object.values(cursors).filter(cursor => cursor.memberId !== me && cursor.pointer);
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    for (const peer of peers) {
      const target = { tx: peer.pointer!.x, ty: peer.pointer!.y };
      const existing = motions.current.get(peer.memberId);
      if (existing) Object.assign(existing, target);
      else motions.current.set(peer.memberId, { x: target.tx, y: target.ty, vx: 0, vy: 0, ...target });
    }
    for (const id of [...motions.current.keys()]) if (!peers.some(peer => peer.memberId === id)) motions.current.delete(id);
  }, [peers]);

  useEffect(() => {
    if (!peers.length) return;
    let frame = 0; let last = performance.now();
    const paint = (id: string, motion: Motion) => {
      const node = nodes.current.get(id);
      if (node) node.style.transform = `translate(${(motion.x * 100).toFixed(3)}%, ${(motion.y * 100).toFixed(3)}%)`;
    };
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let moving = false;
      for (const [id, motion] of motions.current) {
        if (reduced) { motion.x = motion.tx; motion.y = motion.ty; paint(id, motion); continue; }
        const ax = STIFFNESS * (motion.tx - motion.x) - DAMPING * motion.vx;
        const ay = STIFFNESS * (motion.ty - motion.y) - DAMPING * motion.vy;
        motion.vx += ax * dt; motion.vy += ay * dt;
        motion.x += motion.vx * dt; motion.y += motion.vy * dt;
        if (Math.abs(motion.tx - motion.x) > 0.0005 || Math.abs(motion.ty - motion.y) > 0.0005 || Math.abs(motion.vx) > 0.001 || Math.abs(motion.vy) > 0.001) moving = true;
        else { motion.x = motion.tx; motion.y = motion.ty; motion.vx = 0; motion.vy = 0; }
        paint(id, motion);
      }
      if (moving && !reduced) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [peers, reduced]);

  if (!peers.length) return null;
  const now = Date.now();
  return <div className="teams-cursors" aria-hidden="true">
    {peers.map(peer => {
      const member = members.find(item => item.id === peer.memberId);
      const idle = now - Date.parse(peer.at) > 4000;
      const color = personColor(peer.memberId, members);
      return <div key={peer.memberId} className="teams-cursor" data-idle={idle || undefined} style={{ "--person": color } as React.CSSProperties} ref={node => { if (node) { nodes.current.set(peer.memberId, node); const motion = motions.current.get(peer.memberId); if (motion) node.style.transform = `translate(${motion.x * 100}%, ${motion.y * 100}%)`; } else nodes.current.delete(peer.memberId); }}>
        <div className="teams-cursor-arrow">
          <svg viewBox="0 0 18 18" width="18" height="18"><path d="M2.5 1.5 L15 9.2 L9.6 10.3 L6.6 15.6 Z" /></svg>
          <span className="teams-cursor-name">{(member?.displayName ?? "Teammate").slice(0, 14)}</span>
        </div>
      </div>;
    })}
  </div>;
}
