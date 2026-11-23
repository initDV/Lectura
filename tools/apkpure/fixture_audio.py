"""Prepare synthetic narration for the test project, never distributed with Lectura."""
import ctypes as c
from pathlib import Path
import wave

import espeakng_loader


def narrate(text, voice, path):
    lib = c.CDLL(espeakng_loader.get_library_path())
    data = str(Path(espeakng_loader.get_data_path()).parent).encode()
    callback = c.CFUNCTYPE(c.c_int, c.POINTER(c.c_short), c.c_int, c.c_void_p)
    lib.espeak_Initialize.argtypes = [c.c_int, c.c_int, c.c_char_p, c.c_int]
    lib.espeak_SetVoiceByName.argtypes = [c.c_char_p]
    lib.espeak_SetSynthCallback.argtypes = [callback]
    lib.espeak_SetParameter.argtypes = [c.c_int, c.c_int, c.c_int]
    lib.espeak_Synth.argtypes = [c.c_char_p, c.c_size_t, c.c_uint, c.c_int,
                                c.c_uint, c.c_uint, c.POINTER(c.c_uint), c.c_void_p]
    rate = lib.espeak_Initialize(2, 0, data, 0x8000)  # synchronous callbacks, do not exit on error
    if rate <= 0:
        raise RuntimeError('Could not initialise the offline fixture voice.')
    samples = []

    @callback
    def collect(pointer, count, _events):
        if pointer and count > 0:
            samples.append(c.string_at(pointer, count * 2))
        return 0

    try:
        lib.espeak_SetSynthCallback(collect)
        utf8 = text.encode()
        if lib.espeak_SetVoiceByName(voice.encode()) or lib.espeak_SetParameter(1, 120, 0):
            raise RuntimeError(f'Fixture voice unavailable: {voice}.')
        if lib.espeak_Synth(utf8, len(utf8) + 1, 0, 1, 0, 0x1001, None, None):
            raise RuntimeError(f'Fixture synthesis failed: {voice}.')
    finally:
        lib.espeak_Terminate()
    pcm = b''.join(samples)
    if not pcm:
        raise RuntimeError('Empty narration')
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm)
    return len(pcm) * 1000 // (2 * rate)
