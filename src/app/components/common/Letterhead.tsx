'use client';

import Image from 'next/image';

export interface LetterheadProps {
  compact?: boolean;
  className?: string;
  src?: string;
  alt?: string;
}

export function Letterhead({
  compact = false,
  className = '',
  src = '/kop-surat.png',
  alt = 'Kop Surat UPN Veteran Jakarta',
}: LetterheadProps) {
  return (
    <div
      className={[
        'letterhead',
        compact ? 'letterhead--compact' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <Image
        src={src}
        alt={alt}
        width={1400}
        height={200}
        priority
        unoptimized
        className="letterhead__image"
        sizes="100vw"
      />
    </div>
  );
}

/**
 * Document header with letterhead and title block
 */
export interface DocumentHeaderProps {
  title: string;
  program: string;
  semester: string;
  academicYear: string;
  compact?: boolean;
}

export function DocumentHeader({
  title,
  program,
  semester,
  academicYear,
  compact = false,
}: DocumentHeaderProps) {
  return (
    <header className="document-header">
      <Letterhead compact={compact} />
      <div className="document-header__titles">
        <h1 className="document-header__title">{title}</h1>
        <p className="document-header__program">{program}</p>
        <p className="document-header__faculty">
          FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA
        </p>
        <p className="document-header__period">
          SEMESTER {semester} T.A. {academicYear}
        </p>
      </div>
    </header>
  );
}

/**
 * Wait for all images in a container to load before PDF capture
 */
export async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve, reject) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }

          image.addEventListener(
            'load',
            () => resolve(),
            { once: true }
          );
          image.addEventListener(
            'error',
            () => reject(new Error(`Failed to load image: ${image.src}`)),
            { once: true }
          );
        })
    )
  );
}