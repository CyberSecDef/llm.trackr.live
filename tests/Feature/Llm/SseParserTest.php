<?php

use App\Services\Llm\Support\SseParser;
use GuzzleHttp\Psr7\Utils;
use Psr\Http\Message\StreamInterface;

function streamOf(string $body): StreamInterface
{
    return Utils::streamFor($body);
}

it('yields one decoded payload per data: event', function () {
    $stream = streamOf(
        "data: {\"id\":1,\"v\":\"a\"}\n\n" .
        "data: {\"id\":2,\"v\":\"b\"}\n\n" .
        "data: [DONE]\n\n"
    );

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toBe([
        ['id' => 1, 'v' => 'a'],
        ['id' => 2, 'v' => 'b'],
    ]);
});

it('terminates at the [DONE] marker', function () {
    $stream = streamOf(
        "data: {\"v\":\"a\"}\n\n" .
        "data: [DONE]\n\n" .
        "data: {\"v\":\"after-done\"}\n\n"
    );

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toHaveCount(1);
    expect($events[0]['v'])->toBe('a');
});

it('skips non-data: lines', function () {
    $stream = streamOf(
        "event: chunk\n" .
        "data: {\"v\":\"first\"}\n\n" .
        ": this is a comment\n" .
        "data: {\"v\":\"second\"}\n\n"
    );

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toHaveCount(2);
    expect($events[0]['v'])->toBe('first');
    expect($events[1]['v'])->toBe('second');
});

it('skips malformed JSON payloads instead of throwing', function () {
    $stream = streamOf(
        "data: {valid:false\n\n" .
        "data: {\"v\":\"good\"}\n\n"
    );

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toHaveCount(1);
    expect($events[0]['v'])->toBe('good');
});

it('handles an empty stream', function () {
    $stream = streamOf('');

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toBe([]);
});

it('handles a stream that ends without a trailing blank line', function () {
    // Real vendor responses don't always tail with the canonical \n\n.
    $stream = streamOf(
        "data: {\"v\":\"a\"}\n\n" .
        'data: {"v":"b"}'    // no trailing newlines
    );

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toHaveCount(2);
    expect($events[1]['v'])->toBe('b');
});

it('handles CRLF line endings', function () {
    $stream = streamOf(
        "data: {\"v\":\"a\"}\r\n\r\n" .
        "data: [DONE]\r\n\r\n"
    );

    $events = iterator_to_array((new SseParser)->parse($stream), preserve_keys: false);

    expect($events)->toHaveCount(1);
});
