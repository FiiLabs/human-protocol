import { BadGatewayException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3 } from "aws-sdk";
import { ProviderType } from "../common/constants/providers";
import url from "url";
import { isJson } from "../common/helpers";
import { IBucketDto } from "../job/serializers/job.responses";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(ProviderType.S3)
    private readonly s3: S3,
  ) {}

  getBucketNameFromUrl(backetUrl: string): string {
    const result = new url.URL(backetUrl);
    return result?.host?.split(".")[0];
  }

  async getBucketInfo(backetUrl: string): Promise<IBucketDto> {
    const bucketName = this.getBucketNameFromUrl(backetUrl)
    const bucketParams = { Bucket: bucketName };

    const location: any = await new Promise((resolve, reject) => {
      this.s3.getBucketLocation(bucketParams, function(err: any, data: any) {
        if (err) {
          reject(err);
        } else if (data) {
          resolve(data);
        }
      });
    });

    return {
      name: bucketName,
      region: location?.LocationConstraint || null
    }
  }

  async getDataFromBucket(backetUrl: string, excludedFilenames: string[]): Promise<any> {
    const bucketName = this.getBucketNameFromUrl(backetUrl)
    const bucketParams = { Bucket: bucketName };
    const data: any = [];

    return new Promise((resolve, reject) => {
      this.s3 .listObjects(bucketParams, function (err, files) {
        if (err) {
          reject(err);
        } else {
          files.Contents?.forEach(item => {
            const filename = item?.Key as string;
            if (!excludedFilenames.includes(filename)) data.push(filename);
          });
          resolve(data);
        }
      });
    });
  }

  async getFileFromUrl(fileUrl: string): Promise<any> {
    const result = new url.URL(fileUrl);
    const filename = result.pathname.slice(1)
    const bucketName = result.host.split(".")[0];
    const bucketParams = { Bucket: bucketName, Key: filename };
    let data = {}

    return new Promise((resolve, reject) => {
      this.s3.getObject(bucketParams, function (err: any, data: any) {
        if (err) {
          reject(err);
        } else {
          if (!isJson(JSON.parse(data.Body.toString('utf-8')))) {
            resolve(JSON.parse(data.Body.toString('utf-8')))
          } else {
            reject(new BadGatewayException("Invalid JSON file"))
          }
        }
      });
    });
  }

  async isBucketValid(backetUrl: string): Promise<any> {
    const bucketName = this.getBucketNameFromUrl(backetUrl)
    const bucketParams = { Bucket: bucketName };

    const permissions: any = await new Promise((resolve, reject) => {
      this.s3.getBucketAcl(bucketParams, function(err: any, data: any) {
        if (err) {
          reject(err);
        } else if (data) {
          resolve(data);
        }
      });
    });
    
    this.logger.debug("Bucket has following permissions: ", permissions)
    
    if (permissions?.Grants[0]?.Permission != 'FULL_CONTROL') {
      return false;
    }

    return true;
  }

  async isFileValid(fileUrl: string): Promise<any> {
    const result = new url.URL(fileUrl);
    const filename = result.pathname.slice(1)
    const bucketName = result.host.split(".")[0];
    const bucketParams = { Bucket: bucketName, Key: filename };

    const permissions: any = await new Promise((resolve, reject) => {
      this.s3.getObjectAcl(bucketParams, function(err: any, data: any) {
        if (err) {
          reject(err);
        } else if (data) {
          resolve(data);
        }
      });
    });
    
    this.logger.debug("File has following permissions: ", permissions)
    
    if (permissions?.Grants[0]?.Permission != 'FULL_CONTROL') {
      return false;
    }

    return true;
  }
}
