<?php

use App\Services\Threads\ShareTokenGenerator;

describe('ShareTokenGenerator', function () {
    it('produces 32 hex chars (128 bits entropy)', function () {
        $token = (new ShareTokenGenerator)->generate();
        expect($token)->toHaveLength(32);
        expect($token)->toMatch('/^[0-9a-f]{32}$/');
    });

    it('produces distinct tokens across calls', function () {
        $gen = new ShareTokenGenerator;
        $seen = [];
        for ($i = 0; $i < 50; $i++) {
            $seen[$gen->generate()] = true;
        }
        // 50 calls × 128 bits ≈ zero collision probability.
        expect(count($seen))->toBe(50);
    });
});
