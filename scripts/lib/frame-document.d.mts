/*
 * Multiverse Mages — types for the shared frame encoder.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AgentSession } from '@mm/agent-api';
import type { PortalStanding, ReferenceContent } from '@mm/scenario';

/** What `header()` reads: the run's coordinates and its frame spine. */
export interface FrameRun {
  readonly seed: number;
  readonly cap: number;
  readonly session: AgentSession;
  readonly frames: readonly unknown[];
  readonly sandbox: unknown;
  readonly sheet: { readonly digest: string } | null;
}

export interface FrameHeader {
  provenance: Record<string, unknown> & { recordedBy: string; ticks: number };
  layout: unknown;
  actions: unknown;
  content: Record<string, unknown>;
}

export interface FrameDocument {
  encodeFrame(
    session: AgentSession,
    extras?: { readonly godReport?: () => unknown; readonly portalStanding?: () => PortalStanding | undefined },
  ): Record<string, unknown>;
  header(run: FrameRun): FrameHeader;
  declaredCheats(spec: unknown): string[];
  /** The header's content block alone — the same for every universe. */
  content(): Record<string, unknown>;
}

export function frameDocument(content: ReferenceContent, recordedBy: string): FrameDocument;
