<?php

namespace App\Enums;

enum ArchitectureType: string
{
    case Dense = 'dense';
    case Moe = 'moe';

    public function isMoe(): bool
    {
        return $this === self::Moe;
    }
}
