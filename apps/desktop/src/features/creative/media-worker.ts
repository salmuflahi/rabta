import {
  Input,
  BlobSource,
  ALL_FORMATS,
  Output,
  BufferTarget,
  Conversion,
  Mp4OutputFormat,
  WebMOutputFormat,
  WavOutputFormat,
  OggOutputFormat,
  Quality,
} from "mediabunny";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async ({ data }) => {
  let input: Input | undefined;
  try {
    const { file, action, settings = {} } = data;
    if (
      !(file instanceof Blob) ||
      file.size < 1 ||
      file.size > 100 * 1024 * 1024
    )
      throw Error("Choose one media file up to 100 MB.");
    input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
      throw Error("Use a clip up to 10 minutes long.");
    const video = await input.getPrimaryVideoTrack(),
      audio = await input.getPrimaryAudioTrack();
    if (!video && !audio)
      throw Error("No supported video or audio track was found.");
    const width = video ? await video.getDisplayWidth() : 0,
      height = video ? await video.getDisplayHeight() : 0;
    if (width * height > 3840 * 2160)
      throw Error("Use video up to 4K (3840 × 2160 pixels).");
    if (action === "inspect") {
      scope.postMessage({
        ok: true,
        duration,
        width,
        height,
        hasVideo: Boolean(video),
        hasAudio: Boolean(audio),
      });
      return;
    }
    const format = settings.format;
    if (!["mp4", "webm", "wav", "ogg"].includes(format))
      throw Error("Choose MP4, WebM, WAV or Ogg.");
    const audioOnly = format === "wav" || format === "ogg";
    if (audioOnly && !audio)
      throw Error("This file has no audio track to extract.");
    if (!audioOnly && !video)
      throw Error("Use WAV or Ogg for an audio-only source.");
    const start = Number(settings.start),
      end = Number(settings.end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > duration + 0.01
    )
      throw Error(
        "Keep the start and end inside the clip, with the end after the start.",
      );
    const maxHeight = Number(settings.height);
    if (![0, 720, 1080, 2160].includes(maxHeight))
      throw Error("Choose an original, 720p, 1080p or 4K output.");
    const target = new BufferTarget();
    const output = new Output({
      format:
        format === "mp4"
          ? new Mp4OutputFormat()
          : format === "webm"
            ? new WebMOutputFormat()
            : format === "wav"
              ? new WavOutputFormat()
              : new OggOutputFormat(),
      target,
    });
    target.on("write", ({ end }) => {
      if (end > 100 * 1024 * 1024)
        throw Error(
          "The output exceeds 100 MB. Shorten the clip or choose a smaller output.",
        );
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: start > 0 || end < duration ? { start, end } : undefined,
      video: audioOnly
        ? { discard: true }
        : {
            ...(maxHeight && height > maxHeight ? { height: maxHeight } : {}),
            ...(settings.quality === "original"
              ? {}
              : {
                  quality: new Quality(
                    settings.quality === "high" ? "high" : "medium",
                  ),
                }),
          },
      audio: settings.mute && !audioOnly ? { discard: true } : {},
      tags: {},
    });
    if (
      !conversion.isValid ||
      conversion.discardedTracks.some((t) => t.reason !== "discarded_by_user")
    )
      throw Error(
        "Your browser cannot decode this source or encode the chosen format without dropping a track. Try WebM for video or WAV for audio, or use a browser with the required codec.",
      );
    conversion.onProgress = (progress) => scope.postMessage({ progress });
    await conversion.execute();
    if (!target.buffer?.byteLength)
      throw Error("No output was created. Try another format.");
    const mime =
      format === "mp4"
        ? "video/mp4"
        : format === "webm"
          ? "video/webm"
          : format === "wav"
            ? "audio/wav"
            : "audio/ogg";
    scope.postMessage({
      ok: true,
      blob: new Blob([target.buffer], { type: mime }),
      duration: end - start,
      format,
      audioOnly,
    });
  } catch (e) {
    scope.postMessage({
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not convert this media file.",
    });
  } finally {
    input?.dispose();
  }
};
