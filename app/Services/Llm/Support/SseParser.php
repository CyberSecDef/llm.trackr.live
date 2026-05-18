<?php

namespace App\Services\Llm\Support;

use Generator;
use Psr\Http\Message\StreamInterface;

/**
 * Parses OpenAI-style Server-Sent Events into a stream of decoded
 * JSON payloads.
 *
 * Wire format:
 *   data: {"id":"chatcmpl-x","choices":[{"delta":{"content":"Hi"}}]}\n
 *   data: {"id":"chatcmpl-x","choices":[{"delta":{"content":" there"}}]}\n
 *   \n
 *   data: [DONE]\n
 *   \n
 *
 * Each `data:` line carries one JSON object. A literal `data: [DONE]`
 * marker terminates the stream. Blank lines separate events.
 *
 * This parser is reused by the 5 OpenAI-compatible vendor clients
 * (OpenAI, xAI, Mistral, Groq, Together) — they all use the same
 * SSE shape. Anthropic / Google / HuggingFace get their own parsers.
 */
class SseParser
{
    /**
     * Yield each decoded `data:` payload from the given stream.
     *
     * Reads 8 KB at a time and processes complete events as they
     * arrive — works for both Http::fake() (whole-body) responses
     * and real streaming responses from Guzzle.
     *
     * @return Generator<int, array<string, mixed>>
     */
    public function parse(StreamInterface $body): Generator
    {
        $buffer = '';

        while (! $body->eof()) {
            $chunk = $body->read(8192);
            if ($chunk === '') {
                break;
            }

            $buffer .= $chunk;
            $inner = $this->drainEvents($buffer);
            yield from $inner;
            if ($inner->getReturn() === true) {
                // Inner saw [DONE] — terminate the whole parse.
                return;
            }
        }

        // Whatever's left after EOF — flush it.
        if (trim($buffer) !== '') {
            yield from $this->drainEvents($buffer, force: true);
        }
    }

    /**
     * Consume complete `\n\n`-separated events from $buffer, mutating
     * the buffer to remove what was parsed. If $force is true, parse
     * whatever remains even without a trailing blank line (for the
     * final tail after EOF).
     *
     * Returns true via `Generator::getReturn()` if a `[DONE]` marker
     * was seen, so the outer `parse()` knows to stop.
     *
     * @return Generator<int, array<string, mixed>>
     */
    private function drainEvents(string &$buffer, bool $force = false): Generator
    {
        while (true) {
            $pos = strpos($buffer, "\n\n");
            if ($pos === false) {
                if (! $force) {
                    return false;
                }
                $event = $buffer;
                $buffer = '';
            } else {
                $event = substr($buffer, 0, $pos);
                $buffer = substr($buffer, $pos + 2);
            }

            foreach (preg_split("/\r?\n/", $event) as $line) {
                if (! str_starts_with($line, 'data: ')) {
                    continue;
                }
                $data = substr($line, 6);
                if ($data === '[DONE]') {
                    return true;
                }
                $decoded = json_decode($data, true);
                if (is_array($decoded)) {
                    yield $decoded;
                }
            }

            if ($force) {
                return false;
            }
        }
    }
}
