import { displayNameOfFile, displayNameOfUrl } from './media-name';

describe('displayNameOfFile', () => {
  it('drops the sort stamp and id the service puts in front of a name', () => {
    expect(displayNameOfFile('8299999999999-abcd1234-Hero-Banner.png')).toBe(
      'Hero-Banner.png'
    );
  });

  it('leaves any other name alone', () => {
    expect(displayNameOfFile('logo.svg')).toBe('logo.svg');
    expect(displayNameOfFile('2024-summer-sale.jpg')).toBe(
      '2024-summer-sale.jpg'
    );
  });

  it('never returns an empty name', () => {
    expect(displayNameOfFile('8299999999999-abcd1234-')).toBe(
      '8299999999999-abcd1234-'
    );
  });
});

describe('displayNameOfUrl', () => {
  it('names the file a storage URL points at', () => {
    expect(
      displayNameOfUrl(
        'https://storage.googleapis.com/b/page-builder/media/images/8299999999999-abcd1234-Hero.png'
      )
    ).toBe('Hero.png');
  });

  it('decodes, and ignores the query and fragment', () => {
    expect(
      displayNameOfUrl('https://cdn.test/a/my%20photo.jpg?w=200#top')
    ).toBe('my photo.jpg');
  });

  it('keeps a segment that is not valid percent-encoding', () => {
    expect(displayNameOfUrl('https://cdn.test/100%.png')).toBe('100%.png');
  });

  it('names a site-relative path too', () => {
    expect(displayNameOfUrl('/media/banner.png?v=2')).toBe('banner.png');
  });

  it('has nothing to say about a data URL, an empty string or a bare origin', () => {
    expect(displayNameOfUrl('data:image/png;base64,AAAA')).toBe('');
    expect(displayNameOfUrl('')).toBe('');
    expect(displayNameOfUrl('/')).toBe('');
    // The host is not a file name.
    expect(displayNameOfUrl('https://cdn.example.com')).toBe('');
    expect(displayNameOfUrl('https://cdn.example.com/?x=1')).toBe('');
  });
});
